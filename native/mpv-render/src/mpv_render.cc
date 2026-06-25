#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include <napi.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#endif

namespace {

constexpr int kMaxFrameWidth = 1920;
constexpr int kMaxFrameHeight = 1080;

#ifdef __APPLE__
constexpr const char* kHwdec = "videotoolbox-copy";
#else
constexpr const char* kHwdec = "auto-safe";
#endif

size_t Align64(size_t value) {
  return (value + 63u) & ~63u;
}

double NormalizeUnitVolume(double volume) {
  if (!std::isfinite(volume)) return 1.0;
  return std::clamp(volume, 0.0, 1.0);
}

void ThrowMpv(Napi::Env env, const char* action, int err) {
  std::string message(action);
  message += ": ";
  message += mpv_error_string(err);
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

void ThrowMessage(Napi::Env env, const char* message) {
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

void ThrowMessage(Napi::Env env, const std::string& message) {
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

Napi::Object MakeBackendInfo(
    Napi::Env env,
    const char* id,
    const char* api_type,
    bool available,
    bool zero_copy,
    const char* reason) {
  Napi::Object backend = Napi::Object::New(env);
  backend.Set("id", id);
  backend.Set("apiType", api_type);
  backend.Set("available", available);
  backend.Set("zeroCopy", zero_copy);
  backend.Set("reason", reason);
  return backend;
}

Napi::Value GetRenderBackendReport(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array backends = Napi::Array::New(env, 3);
  backends.Set(
      uint32_t{0},
      MakeBackendInfo(
          env,
          "software",
          MPV_RENDER_API_TYPE_SW,
          true,
          false,
          "Active RGBA software-frame renderer."));
  backends.Set(
      uint32_t{1},
      MakeBackendInfo(
          env,
          "opengl",
          MPV_RENDER_API_TYPE_OPENGL,
          false,
          true,
          "Offscreen OpenGL FBO probe and persistent renderer are available, but this addon does not create a shared Electron/Chromium GL context yet."));
  backends.Set(
      uint32_t{2},
      MakeBackendInfo(
          env,
          "metal",
          "metal",
          false,
          true,
          "libmpv render.h exposes software and OpenGL APIs here; Metal needs a separate bridge after OpenGL is proven."));

  Napi::Object report = Napi::Object::New(env);
  report.Set("activeBackend", "software");
  report.Set("backends", backends);
  return report;
}

#ifdef __APPLE__
std::string CglErrorMessage(const char* action, CGLError err) {
  std::string message(action);
  message += ": ";
  const char* cgl_error = CGLErrorString(err);
  message += cgl_error ? cgl_error : "unknown CGL error";
  return message;
}

void ThrowCgl(Napi::Env env, const char* action, CGLError err) {
  ThrowMessage(env, CglErrorMessage(action, err));
}

void* GetOpenGLProcAddress(void*, const char* name) {
  CFBundleRef bundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl"));
  if (!bundle) return nullptr;

  CFStringRef symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
  if (!symbol) return nullptr;
  void* address = CFBundleGetFunctionPointerForName(bundle, symbol);
  CFRelease(symbol);
  return address;
}

class ScopedCglContext final {
 public:
  ScopedCglContext() = default;
  ScopedCglContext(const ScopedCglContext&) = delete;
  ScopedCglContext& operator=(const ScopedCglContext&) = delete;

  ~ScopedCglContext() {
    if (context_ && CGLGetCurrentContext() == context_) {
      CGLSetCurrentContext(nullptr);
    }
    if (context_) CGLDestroyContext(context_);
    if (pixel_format_) CGLDestroyPixelFormat(pixel_format_);
  }

  bool Create(Napi::Env env) {
    CGLPixelFormatAttribute attributes[] = {
        kCGLPFAOpenGLProfile,
        static_cast<CGLPixelFormatAttribute>(kCGLOGLPVersion_3_2_Core),
        kCGLPFAAccelerated,
        kCGLPFAAllowOfflineRenderers,
        kCGLPFAColorSize,
        static_cast<CGLPixelFormatAttribute>(24),
        kCGLPFAAlphaSize,
        static_cast<CGLPixelFormatAttribute>(8),
        static_cast<CGLPixelFormatAttribute>(0),
    };

    GLint pixel_format_count = 0;
    CGLError err = CGLChoosePixelFormat(attributes, &pixel_format_, &pixel_format_count);
    if (err != kCGLNoError || !pixel_format_) {
      ThrowCgl(env, "OpenGL probe: CGLChoosePixelFormat failed", err);
      return false;
    }

    err = CGLCreateContext(pixel_format_, nullptr, &context_);
    if (err != kCGLNoError || !context_) {
      ThrowCgl(env, "OpenGL probe: CGLCreateContext failed", err);
      return false;
    }

    err = CGLSetCurrentContext(context_);
    if (err != kCGLNoError) {
      ThrowCgl(env, "OpenGL probe: CGLSetCurrentContext failed", err);
      return false;
    }
    return true;
  }

  bool MakeCurrent(Napi::Env env, const char* action) const {
    if (!context_) {
      ThrowMessage(env, "OpenGL renderer: CGL context is not created");
      return false;
    }

    const CGLError err = CGLSetCurrentContext(context_);
    if (err != kCGLNoError) {
      ThrowCgl(env, action, err);
      return false;
    }
    return true;
  }

  void MakeCurrentUnchecked() const {
    if (context_) (void)CGLSetCurrentContext(context_);
  }

 private:
  CGLPixelFormatObj pixel_format_ = nullptr;
  CGLContextObj context_ = nullptr;
};

class ScopedFramebuffer final {
 public:
  ScopedFramebuffer() = default;
  ScopedFramebuffer(const ScopedFramebuffer&) = delete;
  ScopedFramebuffer& operator=(const ScopedFramebuffer&) = delete;

  ~ScopedFramebuffer() {
    if (fbo_ != 0) glDeleteFramebuffers(1, &fbo_);
    if (texture_ != 0) glDeleteTextures(1, &texture_);
  }

  bool Create(Napi::Env env, int width, int height) {
    width_ = width;
    height_ = height;

    glGenTextures(1, &texture_);
    glBindTexture(GL_TEXTURE_2D, texture_);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width_, height_, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);

    glGenFramebuffers(1, &fbo_);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture_, 0);

    const GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    if (status != GL_FRAMEBUFFER_COMPLETE) {
      std::ostringstream message;
      message << "OpenGL probe: framebuffer is incomplete: status=" << status;
      ThrowMessage(env, message.str());
      return false;
    }
    return CheckNoError(env, "OpenGL probe: create framebuffer failed");
  }

  bool Clear(Napi::Env env) const {
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glViewport(0, 0, width_, height_);
    glClearColor(0.0F, 0.0F, 0.0F, 1.0F);
    glClear(GL_COLOR_BUFFER_BIT);
    return CheckNoError(env, "OpenGL probe: clear framebuffer failed");
  }

  bool ReadPixels(Napi::Env env, std::vector<uint8_t>* pixels) const {
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, width_, height_, GL_RGBA, GL_UNSIGNED_BYTE, pixels->data());
    return CheckNoError(env, "OpenGL probe: read pixels failed");
  }

  int fbo() const { return static_cast<int>(fbo_); }
  int texture() const { return static_cast<int>(texture_); }
  int width() const { return width_; }
  int height() const { return height_; }

 private:
  static bool CheckNoError(Napi::Env env, const char* action) {
    const GLenum err = glGetError();
    if (err == GL_NO_ERROR) return true;

    std::ostringstream message;
    message << action << ": glError=" << err;
    ThrowMessage(env, message.str());
    return false;
  }

  GLuint texture_ = 0;
  GLuint fbo_ = 0;
  int width_ = 0;
  int height_ = 0;
};

class ScopedMpvOpenGLRenderer final {
 public:
  ScopedMpvOpenGLRenderer() = default;
  ScopedMpvOpenGLRenderer(const ScopedMpvOpenGLRenderer&) = delete;
  ScopedMpvOpenGLRenderer& operator=(const ScopedMpvOpenGLRenderer&) = delete;

  ~ScopedMpvOpenGLRenderer() {
    if (render_) mpv_render_context_free(render_);
    if (mpv_) mpv_terminate_destroy(mpv_);
  }

  bool Create(Napi::Env env) {
    mpv_ = mpv_create();
    if (!mpv_) {
      ThrowMessage(env, "OpenGL probe: mpv_create failed");
      return false;
    }

    if (!SetOption("terminal", "no", env) ||
        !SetOption("vo", "libmpv", env) ||
        !SetOption("hwdec", "no", env) ||
        !SetOption("profile", "sw-fast", env) ||
        !SetOption("video-timing-offset", "0", env)) {
      return false;
    }

    int err = mpv_initialize(mpv_);
    if (err < 0) {
      ThrowMpv(env, "OpenGL probe: mpv_initialize failed", err);
      return false;
    }

    mpv_opengl_init_params gl_init = {GetOpenGLProcAddress, nullptr};
    const char* api_type = MPV_RENDER_API_TYPE_OPENGL;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(api_type)},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl_init},
        {MPV_RENDER_PARAM_INVALID, nullptr},
    };
    err = mpv_render_context_create(&render_, mpv_, params);
    if (err < 0) {
      ThrowMpv(env, "OpenGL probe: mpv_render_context_create(opengl) failed", err);
      return false;
    }
    return true;
  }

  bool Load(Napi::Env env, const std::string& url, double start_sec) {
    int err = 0;
    if (start_sec > 0) {
      std::string start_arg = "start=" + std::to_string(start_sec);
      const char* cmd[] = {"loadfile", url.c_str(), "replace", "-1", start_arg.c_str(), nullptr};
      err = mpv_command(mpv_, cmd);
    } else {
      const char* cmd[] = {"loadfile", url.c_str(), "replace", nullptr};
      err = mpv_command(mpv_, cmd);
    }
    if (err < 0) {
      ThrowMpv(env, "OpenGL probe: loadfile failed", err);
      return false;
    }

    int paused = 0;
    (void)mpv_set_property(mpv_, "pause", MPV_FORMAT_FLAG, &paused);
    return true;
  }

  bool LoadTestSource(Napi::Env env, int width, int height) {
    const std::string source =
        "av://lavfi:testsrc=size=" + std::to_string(width) + "x" + std::to_string(height) +
        ":rate=5:duration=2";
    return Load(env, source, 0);
  }

  bool Render(Napi::Env env, const ScopedFramebuffer& target) {
    PumpEvents(0.02);
    (void)mpv_render_context_update(render_);

    mpv_opengl_fbo fbo = {target.fbo(), target.width(), target.height(), GL_RGBA8};
    int flip_y = 0;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
        {MPV_RENDER_PARAM_FLIP_Y, &flip_y},
        {MPV_RENDER_PARAM_INVALID, nullptr},
    };
    const int err = mpv_render_context_render(render_, params);
    if (err < 0) {
      ThrowMpv(env, "OpenGL probe: render failed", err);
      return false;
    }
    mpv_render_context_report_swap(render_);
    glFinish();
    return true;
  }

 private:
  bool SetOption(const char* name, const char* value, Napi::Env env) {
    const int err = mpv_set_option_string(mpv_, name, value);
    if (err < 0) {
      std::string action = "OpenGL probe: set option ";
      action += name;
      ThrowMpv(env, action.c_str(), err);
      return false;
    }
    return true;
  }

  void PumpEvents(double timeout) {
    while (mpv_) {
      mpv_event* event = mpv_wait_event(mpv_, timeout);
      timeout = 0;
      if (!event || event->event_id == MPV_EVENT_NONE) return;
    }
  }

  mpv_handle* mpv_ = nullptr;
  mpv_render_context* render_ = nullptr;
};

bool HasNonZeroRgb(const std::vector<uint8_t>& pixels) {
  for (size_t i = 0; i + 3 < pixels.size(); i += 4) {
    if (pixels[i] != 0 || pixels[i + 1] != 0 || pixels[i + 2] != 0) return true;
  }
  return false;
}

class OpenGLRenderer final : public Napi::ObjectWrap<OpenGLRenderer> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(
        env,
        "OpenGLRenderer",
        {
            InstanceMethod("load", &OpenGLRenderer::Load),
            InstanceMethod("renderFrame", &OpenGLRenderer::RenderFrame),
            InstanceMethod("getTextureInfo", &OpenGLRenderer::GetTextureInfo),
            InstanceMethod("dispose", &OpenGLRenderer::DisposeWrapped),
        });
    constructor = Napi::Persistent(ctor);
    constructor.SuppressDestruct();
    exports.Set("OpenGLRenderer", ctor);
    return exports;
  }

  explicit OpenGLRenderer(const Napi::CallbackInfo& info) : Napi::ObjectWrap<OpenGLRenderer>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
      ThrowMessage(env, "OpenGLRenderer(width, height): width and height must be numbers");
      return;
    }

    width_ = std::clamp(info[0].As<Napi::Number>().Int32Value(), 2, kMaxFrameWidth);
    height_ = std::clamp(info[1].As<Napi::Number>().Int32Value(), 2, kMaxFrameHeight);

    context_ = std::make_unique<ScopedCglContext>();
    if (!context_->Create(env)) return;

    target_ = std::make_unique<ScopedFramebuffer>();
    if (!target_->Create(env, width_, height_)) return;

    renderer_ = std::make_unique<ScopedMpvOpenGLRenderer>();
    if (!renderer_->Create(env)) return;
  }

  ~OpenGLRenderer() override {
    DisposeNoThrow();
  }

 private:
  static Napi::FunctionReference constructor;

  std::unique_ptr<ScopedCglContext> context_;
  std::unique_ptr<ScopedFramebuffer> target_;
  std::unique_ptr<ScopedMpvOpenGLRenderer> renderer_;
  int width_ = 0;
  int height_ = 0;
  bool disposed_ = false;

  bool CheckReady(Napi::Env env) const {
    if (disposed_ || !context_ || !target_ || !renderer_) {
      ThrowMessage(env, "OpenGL renderer: renderer is disposed");
      return false;
    }
    return true;
  }

  Napi::Value Load(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsString()) {
      ThrowMessage(env, "OpenGLRenderer.load(url, startSec): url must be a string");
      return env.Undefined();
    }

    const std::string url = info[0].As<Napi::String>().Utf8Value();
    double start_sec = 0;
    if (info.Length() > 1 && info[1].IsNumber()) {
      start_sec = info[1].As<Napi::Number>().DoubleValue();
    }

    if (!context_->MakeCurrent(env, "OpenGL renderer: CGLSetCurrentContext failed")) {
      return env.Undefined();
    }
    if (!renderer_->Load(env, url, start_sec)) return env.Undefined();
    return env.Undefined();
  }

  Napi::Value RenderFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Null();
    if (!context_->MakeCurrent(env, "OpenGL renderer: CGLSetCurrentContext failed")) {
      return env.Null();
    }

    std::vector<uint8_t> pixels(static_cast<size_t>(width_) * static_cast<size_t>(height_) * 4u, 0);
    for (int attempt = 0; attempt < 20; ++attempt) {
      if (!target_->Clear(env)) return env.Null();
      if (!renderer_->Render(env, *target_)) return env.Null();
      if (!target_->ReadPixels(env, &pixels)) return env.Null();
      if (HasNonZeroRgb(pixels)) break;
      std::this_thread::sleep_for(std::chrono::milliseconds(25));
    }

    Napi::Object frame = Napi::Object::New(env);
    frame.Set("backend", "opengl");
    frame.Set("width", width_);
    frame.Set("height", height_);
    frame.Set("format", "rgba");
    frame.Set("data", Napi::Buffer<uint8_t>::Copy(env, pixels.data(), pixels.size()));
    return frame;
  }

  Napi::Value GetTextureInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Null();

    Napi::Object texture = Napi::Object::New(env);
    texture.Set("backend", "opengl");
    texture.Set("width", width_);
    texture.Set("height", height_);
    texture.Set("internalFormat", "rgba8");
    texture.Set("textureId", target_->texture());
    texture.Set("fbo", target_->fbo());
    return texture;
  }

  Napi::Value DisposeWrapped(const Napi::CallbackInfo& info) {
    Dispose(info.Env());
    return info.Env().Undefined();
  }

  void Dispose(Napi::Env env) {
    if (disposed_) return;
    disposed_ = true;
    if (context_) (void)context_->MakeCurrent(env, "OpenGL renderer: CGLSetCurrentContext failed");
    renderer_.reset();
    target_.reset();
    context_.reset();
  }

  void DisposeNoThrow() {
    if (disposed_) return;
    disposed_ = true;
    if (context_) context_->MakeCurrentUnchecked();
    renderer_.reset();
    target_.reset();
    context_.reset();
  }
};

Napi::FunctionReference OpenGLRenderer::constructor;
#endif

#ifndef __APPLE__
class OpenGLRenderer final : public Napi::ObjectWrap<OpenGLRenderer> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(
        env,
        "OpenGLRenderer",
        {
            InstanceMethod("load", &OpenGLRenderer::Unsupported),
            InstanceMethod("renderFrame", &OpenGLRenderer::Unsupported),
            InstanceMethod("getTextureInfo", &OpenGLRenderer::Unsupported),
            InstanceMethod("dispose", &OpenGLRenderer::DisposeWrapped),
        });
    constructor = Napi::Persistent(ctor);
    constructor.SuppressDestruct();
    exports.Set("OpenGLRenderer", ctor);
    return exports;
  }

  explicit OpenGLRenderer(const Napi::CallbackInfo& info) : Napi::ObjectWrap<OpenGLRenderer>(info) {
    ThrowMessage(info.Env(), "OpenGLRenderer is currently implemented only for macOS CGL");
  }

 private:
  static Napi::FunctionReference constructor;

  Napi::Value Unsupported(const Napi::CallbackInfo& info) {
    ThrowMessage(info.Env(), "OpenGLRenderer is currently implemented only for macOS CGL");
    return info.Env().Undefined();
  }

  Napi::Value DisposeWrapped(const Napi::CallbackInfo& info) {
    return info.Env().Undefined();
  }
};

Napi::FunctionReference OpenGLRenderer::constructor;
#endif

Napi::Value RenderOpenGLProbeFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifndef __APPLE__
  ThrowMessage(env, "OpenGL probe is currently implemented only for macOS CGL");
  return env.Null();
#else
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    ThrowMessage(env, "renderOpenGLProbeFrame(width, height): width and height must be numbers");
    return env.Null();
  }

  const int width = std::clamp(info[0].As<Napi::Number>().Int32Value(), 2, kMaxFrameWidth);
  const int height = std::clamp(info[1].As<Napi::Number>().Int32Value(), 2, kMaxFrameHeight);

  ScopedCglContext context;
  if (!context.Create(env)) return env.Null();

  ScopedFramebuffer target;
  if (!target.Create(env, width, height)) return env.Null();

  ScopedMpvOpenGLRenderer renderer;
  if (!renderer.Create(env)) return env.Null();
  if (!renderer.LoadTestSource(env, width, height)) return env.Null();

  std::vector<uint8_t> pixels(static_cast<size_t>(width) * static_cast<size_t>(height) * 4u, 0);
  for (int attempt = 0; attempt < 40; ++attempt) {
    if (!target.Clear(env)) return env.Null();
    if (!renderer.Render(env, target)) return env.Null();
    if (!target.ReadPixels(env, &pixels)) return env.Null();
    if (HasNonZeroRgb(pixels)) break;
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  Napi::Object frame = Napi::Object::New(env);
  frame.Set("backend", "opengl");
  frame.Set("width", width);
  frame.Set("height", height);
  frame.Set("format", "rgba");
  frame.Set("data", Napi::Buffer<uint8_t>::Copy(env, pixels.data(), pixels.size()));
  return frame;
#endif
}

class Player final : public Napi::ObjectWrap<Player> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(
      env,
      "Player",
      {
        InstanceMethod("load", &Player::Load),
        InstanceMethod("setPause", &Player::SetPause),
        InstanceMethod("seek", &Player::Seek),
        InstanceMethod("setAudioTrack", &Player::SetAudioTrack),
        InstanceMethod("setSubtitle", &Player::SetSubtitle),
        InstanceMethod("setVolume", &Player::SetVolume),
        InstanceMethod("addSubtitle", &Player::AddSubtitle),
        InstanceMethod("renderFrame", &Player::RenderFrame),
        InstanceMethod("getState", &Player::GetState),
        InstanceMethod("dispose", &Player::DisposeWrapped),
      }
    );
    constructor = Napi::Persistent(ctor);
    constructor.SuppressDestruct();
    exports.Set("Player", ctor);
    return exports;
  }

  explicit Player(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Player>(info) {
    Napi::Env env = info.Env();
    mpv_ = mpv_create();
    if (!mpv_) {
      ThrowMessage(env, "libmpv: mpv_create failed");
      return;
    }

    if (!SetOption("terminal", "no", env) ||
        !SetOption("vo", "libmpv", env) ||
        !SetOption("hwdec", kHwdec, env) ||
        !SetOption("video-timing-offset", "0", env) ||
        !SetOption("profile", "sw-fast", env)) {
      return;
    }

    int err = mpv_initialize(mpv_);
    if (err < 0) {
      ThrowMpv(env, "libmpv: mpv_initialize failed", err);
      return;
    }

    const char* api_type = MPV_RENDER_API_TYPE_SW;
    mpv_render_param params[] = {
      {MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(api_type)},
      {MPV_RENDER_PARAM_INVALID, nullptr},
    };
    err = mpv_render_context_create(&render_, mpv_, params);
    if (err < 0) {
      ThrowMpv(env, "libmpv: mpv_render_context_create(sw) failed", err);
      return;
    }
  }

  ~Player() override {
    Dispose();
  }

 private:
  static Napi::FunctionReference constructor;

  mpv_handle* mpv_ = nullptr;
  mpv_render_context* render_ = nullptr;
  bool disposed_ = false;

  bool SetOption(const char* name, const char* value, Napi::Env env) {
    int err = mpv_set_option_string(mpv_, name, value);
    if (err < 0) {
      std::string action = "libmpv: set option ";
      action += name;
      ThrowMpv(env, action.c_str(), err);
      return false;
    }
    return true;
  }

  bool CheckReady(Napi::Env env) const {
    if (disposed_ || !mpv_ || !render_) {
      ThrowMessage(env, "libmpv: player is disposed");
      return false;
    }
    return true;
  }

  Napi::Value Load(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsString()) {
      ThrowMessage(env, "load(url, startSec): url must be a string");
      return env.Undefined();
    }

    std::string url = info[0].As<Napi::String>().Utf8Value();
    double start = 0;
    if (info.Length() > 1 && info[1].IsNumber()) {
      start = info[1].As<Napi::Number>().DoubleValue();
    }

    int err = 0;
    if (start > 0) {
      std::string start_arg = "start=" + std::to_string(start);
      const char* cmd[] = {"loadfile", url.c_str(), "replace", "-1", start_arg.c_str(), nullptr};
      err = mpv_command(mpv_, cmd);
    } else {
      const char* cmd[] = {"loadfile", url.c_str(), "replace", nullptr};
      err = mpv_command(mpv_, cmd);
    }
    if (err < 0) ThrowMpv(env, "libmpv: loadfile failed", err);
    return env.Undefined();
  }

  Napi::Value SetPause(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsBoolean()) {
      ThrowMessage(env, "setPause(paused): paused must be a boolean");
      return env.Undefined();
    }
    int paused = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
    int err = mpv_set_property(mpv_, "pause", MPV_FORMAT_FLAG, &paused);
    if (err < 0) ThrowMpv(env, "libmpv: set pause failed", err);
    return env.Undefined();
  }

  Napi::Value Seek(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsNumber()) {
      ThrowMessage(env, "seek(seconds): seconds must be a number");
      return env.Undefined();
    }
    std::string seconds = std::to_string(info[0].As<Napi::Number>().DoubleValue());
    const char* cmd[] = {"seek", seconds.c_str(), "absolute", nullptr};
    int err = mpv_command(mpv_, cmd);
    if (err < 0) ThrowMpv(env, "libmpv: seek failed", err);
    return env.Undefined();
  }

  Napi::Value SetAudioTrack(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsNumber()) {
      ThrowMessage(env, "setAudioTrack(index): index must be a number");
      return env.Undefined();
    }
    int64_t index = info[0].As<Napi::Number>().Int64Value();
    int err = mpv_set_property(mpv_, "aid", MPV_FORMAT_INT64, &index);
    if (err < 0) ThrowMpv(env, "libmpv: set audio track failed", err);
    return env.Undefined();
  }

  Napi::Value SetSubtitle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1) {
      ThrowMessage(env, "setSubtitle(index): index must be a number or null");
      return env.Undefined();
    }
    int err = 0;
    if (info[0].IsNull() || info[0].IsUndefined()) {
      err = mpv_set_property_string(mpv_, "sid", "no");
    } else if (info[0].IsNumber()) {
      int64_t index = info[0].As<Napi::Number>().Int64Value();
      err = mpv_set_property(mpv_, "sid", MPV_FORMAT_INT64, &index);
    } else {
      ThrowMessage(env, "setSubtitle(index): index must be a number or null");
      return env.Undefined();
    }
    if (err < 0) ThrowMpv(env, "libmpv: set subtitle failed", err);
    return env.Undefined();
  }

  Napi::Value SetVolume(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsNumber()) {
      ThrowMessage(env, "setVolume(volume): volume must be a number from 0 to 1");
      return env.Undefined();
    }
    double percent = NormalizeUnitVolume(info[0].As<Napi::Number>().DoubleValue()) * 100.0;
    int err = mpv_set_property(mpv_, "volume", MPV_FORMAT_DOUBLE, &percent);
    if (err < 0) ThrowMpv(env, "libmpv: set volume failed", err);
    return env.Undefined();
  }

  Napi::Value AddSubtitle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsString()) {
      ThrowMessage(env, "addSubtitle(path): path must be a string");
      return env.Undefined();
    }
    std::string path = info[0].As<Napi::String>().Utf8Value();
    const char* cmd[] = {"sub-add", path.c_str(), "select", nullptr};
    int err = mpv_command(mpv_, cmd);
    if (err < 0) ThrowMpv(env, "libmpv: sub-add failed", err);
    return env.Undefined();
  }

  Napi::Value RenderFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Null();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
      ThrowMessage(env, "renderFrame(width, height): width and height must be numbers");
      return env.Null();
    }

    int width = std::clamp(info[0].As<Napi::Number>().Int32Value(), 2, kMaxFrameWidth);
    int height = std::clamp(info[1].As<Napi::Number>().Int32Value(), 2, kMaxFrameHeight);
    size_t packed_stride = static_cast<size_t>(width) * 4u;
    size_t stride = Align64(packed_stride);
    std::vector<uint8_t> surface(stride * static_cast<size_t>(height), 0);

    uint64_t update_flags = mpv_render_context_update(render_);
    int size[2] = {width, height};
    char format[] = "rgb0";
    int block_for_target_time = 0;
    mpv_render_param params[] = {
      {MPV_RENDER_PARAM_SW_SIZE, size},
      {MPV_RENDER_PARAM_SW_FORMAT, format},
      {MPV_RENDER_PARAM_SW_STRIDE, &stride},
      {MPV_RENDER_PARAM_SW_POINTER, surface.data()},
      {MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, &block_for_target_time},
      {MPV_RENDER_PARAM_INVALID, nullptr},
    };

    int err = mpv_render_context_render(render_, params);
    if (err < 0) {
      ThrowMpv(env, "libmpv: renderFrame failed", err);
      return env.Null();
    }
    mpv_render_context_report_swap(render_);

    std::vector<uint8_t> packed(packed_stride * static_cast<size_t>(height));
    for (int y = 0; y < height; ++y) {
      const uint8_t* src = surface.data() + static_cast<size_t>(y) * stride;
      uint8_t* dst = packed.data() + static_cast<size_t>(y) * packed_stride;
      std::memcpy(dst, src, packed_stride);
      for (int x = 0; x < width; ++x) {
        dst[static_cast<size_t>(x) * 4u + 3u] = 255;
      }
    }

    Napi::Object frame = Napi::Object::New(env);
    frame.Set("width", width);
    frame.Set("height", height);
    frame.Set("format", "rgba");
    frame.Set("updated", (update_flags & MPV_RENDER_UPDATE_FRAME) != 0);
    frame.Set("data", Napi::Buffer<uint8_t>::Copy(env, packed.data(), packed.size()));
    return frame;
  }

  Napi::Value GetState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!CheckReady(env)) return env.Null();

    double time_sec = 0;
    double duration_sec = 0;
    int paused = 0;
    int ended = 0;
    (void)mpv_get_property(mpv_, "time-pos", MPV_FORMAT_DOUBLE, &time_sec);
    (void)mpv_get_property(mpv_, "duration", MPV_FORMAT_DOUBLE, &duration_sec);
    (void)mpv_get_property(mpv_, "pause", MPV_FORMAT_FLAG, &paused);
    (void)mpv_get_property(mpv_, "eof-reached", MPV_FORMAT_FLAG, &ended);

    Napi::Object state = Napi::Object::New(env);
    state.Set("timeSec", time_sec);
    state.Set("durationSec", duration_sec);
    state.Set("paused", paused != 0);
    state.Set("ended", ended != 0);
    return state;
  }

  Napi::Value DisposeWrapped(const Napi::CallbackInfo& info) {
    Dispose();
    return info.Env().Undefined();
  }

  void Dispose() {
    if (disposed_) return;
    disposed_ = true;
    if (render_) {
      mpv_render_context_free(render_);
      render_ = nullptr;
    }
    if (mpv_) {
      mpv_terminate_destroy(mpv_);
      mpv_ = nullptr;
    }
  }
};

Napi::FunctionReference Player::constructor;

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  Player::Init(env, exports);
  OpenGLRenderer::Init(env, exports);
  exports.Set("getRenderBackendReport", Napi::Function::New(env, GetRenderBackendReport));
  exports.Set("renderOpenGLProbeFrame", Napi::Function::New(env, RenderOpenGLProbeFrame));
  return exports;
}

NODE_API_MODULE(mpv_render, Init)

}  // namespace

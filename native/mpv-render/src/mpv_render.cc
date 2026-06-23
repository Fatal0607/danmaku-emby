#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include <napi.h>
#include <mpv/client.h>
#include <mpv/render.h>

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

void ThrowMpv(Napi::Env env, const char* action, int err) {
  std::string message(action);
  message += ": ";
  message += mpv_error_string(err);
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

void ThrowMessage(Napi::Env env, const char* message) {
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
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
  return Player::Init(env, exports);
}

NODE_API_MODULE(mpv_render, Init)

}  // namespace

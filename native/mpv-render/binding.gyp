{
  "targets": [
    {
      "target_name": "mpv_render",
      "sources": ["src/mpv_render.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!(brew --prefix mpv 2>/dev/null || echo /opt/homebrew/opt/mpv)/include"
      ],
      "libraries": [
        "<!(brew --prefix mpv 2>/dev/null || echo /opt/homebrew/opt/mpv)/lib/libmpv.dylib"
      ],
      "conditions": [
        ["OS=='mac'", {
          "libraries": [
            "-framework OpenGL",
            "-framework CoreFoundation"
          ],
          "defines": ["GL_SILENCE_DEPRECATION"]
        }]
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      }
    }
  ]
}

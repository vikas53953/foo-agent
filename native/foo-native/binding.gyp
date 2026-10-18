# Spec: 09 §9.19.2 (foo-native: one C++/WinRT N-API addon at native/foo-native/, built with node-gyp; sources below,
# hello.cc = M10, wintrack.cc = M9, ocr.cc = its milestone add their own line). N-API keeps one build loadable by both
# Node (unit tests on windows-latest) and Electron (the app). Linux and macOS build nothing: index.js uses fallback.js.
{
  "targets": [
    {
      "target_name": "foo_native",
      "conditions": [
        [
          "OS=='win'",
          {
            "sources": [
              "addon.cc",
              "jobobject.cc",
              "speech.cc",
              "netcost.cc",
              "toasthistory.cc",
              "toastsetting.cc",
              "textscale.cc",
              "keyboard.cc",
              "focus.cc"
            ],
            "include_dirs": ["$(WindowsSdkDir)Include\\$(WindowsTargetPlatformVersion)\\cppwinrt"],
            "libraries": ["WindowsApp.lib"],
            "defines": ["NOMINMAX", "_HAS_EXCEPTIONS=1", "NAPI_VERSION=8"],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/bigobj", "/utf-8", "/permissive-"]
              }
            }
          }
        ]
      ]
    }
  ]
}

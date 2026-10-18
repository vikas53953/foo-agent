// Spec: 09 §9.17.5 (hold-to-talk moves to Ctrl+Shift+Space when a Chinese, Japanese or Korean keyboard layout is
// installed; layouts from GetKeyboardLayoutList), 08-5 §6 (`keyboardLayouts(): string[]`; fallback []). Each layout is
// given as the BCP-47 tag of its input language (e.g. "en-IN", "ja-JP"), once, in Windows' order.
#include <windows.h>

#include <string>
#include <vector>

#include "common.h"

namespace {

napi_value KeyboardLayouts(napi_env env, napi_callback_info) {
  std::vector<std::string> tags;
  int n = GetKeyboardLayoutList(0, nullptr);
  if (n > 0) {
    std::vector<HKL> layouts(static_cast<size_t>(n));
    n = GetKeyboardLayoutList(n, layouts.data());
    for (int i = 0; i < n; ++i) {
      const LANGID lang = LOWORD(reinterpret_cast<UINT_PTR>(layouts[static_cast<size_t>(i)]));
      wchar_t name[LOCALE_NAME_MAX_LENGTH] = {0};
      if (LCIDToLocaleName(MAKELCID(lang, SORT_DEFAULT), name, LOCALE_NAME_MAX_LENGTH, 0) <= 0) continue;
      std::string tag = foo::Utf8(name);
      bool seen = false;
      for (const auto& t : tags) seen = seen || t == tag;
      if (!seen) tags.push_back(tag);
    }
  }
  napi_value arr;
  napi_create_array_with_length(env, tags.size(), &arr);
  for (size_t i = 0; i < tags.size(); ++i) napi_set_element(env, arr, static_cast<uint32_t>(i), foo::Str(env, tags[i]));
  return arr;
}

}  // namespace

namespace foo {

void InitKeyboard(napi_env env, napi_value exports) {
  Export(env, exports, "keyboardLayouts", KeyboardLayouts);
}

}  // namespace foo

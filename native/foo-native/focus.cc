// Spec: 09 §9.9.6 (foo detects Focus through `focusActive()`: Windows.UI.Shell.FocusSessionManager.IsFocusActive,
// Windows 11 only; null where missing, so the Settings line is not shown on Windows 10), 08-5 §6 (fallback null).
#include <winrt/Windows.Foundation.Metadata.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.Shell.h>

#include "common.h"

namespace {

using winrt::Windows::Foundation::Metadata::ApiInformation;
using winrt::Windows::UI::Shell::FocusSessionManager;

napi_value FocusActive(napi_env env, napi_callback_info) {
  try {
    foo::EnsureApartment();
    if (!ApiInformation::IsTypePresent(L"Windows.UI.Shell.FocusSessionManager")) return foo::Null(env);
    if (!FocusSessionManager::IsSupported()) return foo::Null(env);
    return foo::Bool(env, FocusSessionManager::GetDefault().IsFocusActive());
  } catch (...) {
    return foo::Null(env);
  }
}

}  // namespace

namespace foo {

void InitFocus(napi_env env, napi_value exports) {
  Export(env, exports, "focusActive", FocusActive);
}

}  // namespace foo

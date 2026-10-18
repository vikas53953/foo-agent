// Spec: 08-2 §5.4 l.119 (Stop kills the CLI process tree via the Job Object, TerminateJobObject), CR-0007 §(e) pick 1,
// M11 pack §4.1 (G-M11-01): one Job Object per tracked pid with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (main exiting kills
// every tracked tree), AssignProcessToJobObject; killJobObject(pid) → TerminateJobObject(h, 1) + CloseHandle; unknown
// pid → no-op. Children the process starts after assignment join its job.
#include <windows.h>

#include <map>
#include <mutex>
#include <string>

#include "common.h"

namespace {

std::mutex g_mu;
std::map<uint32_t, HANDLE> g_jobs;

std::string LastError(const char* what) {
  return std::string(what) + " failed (" + std::to_string(GetLastError()) + ")";
}

napi_value Assign(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  uint32_t pid = 0;
  if (!foo::ArgPid(env, argv[0], &pid)) return nullptr;

  std::lock_guard<std::mutex> lock(g_mu);
  if (g_jobs.count(pid) != 0) return foo::Undefined(env);

  HANDLE proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, pid);
  if (proc == nullptr) {
    foo::ThrowCode(env, "JOB_ASSIGN_FAILED", LastError("OpenProcess"));
    return nullptr;
  }
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (job == nullptr) {
    CloseHandle(proc);
    foo::ThrowCode(env, "JOB_ASSIGN_FAILED", LastError("CreateJobObject"));
    return nullptr;
  }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
      !AssignProcessToJobObject(job, proc)) {
    std::string msg = LastError("AssignProcessToJobObject");
    CloseHandle(job);
    CloseHandle(proc);
    foo::ThrowCode(env, "JOB_ASSIGN_FAILED", msg);
    return nullptr;
  }
  CloseHandle(proc);
  g_jobs[pid] = job;
  return foo::Undefined(env);
}

napi_value Kill(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  uint32_t pid = 0;
  if (!foo::ArgPid(env, argv[0], &pid)) return nullptr;

  HANDLE job = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_mu);
    auto it = g_jobs.find(pid);
    if (it == g_jobs.end()) return foo::Undefined(env);
    job = it->second;
    g_jobs.erase(it);
  }
  TerminateJobObject(job, 1);
  CloseHandle(job);
  return foo::Undefined(env);
}

}  // namespace

namespace foo {

void InitJobObject(napi_env env, napi_value exports) {
  Export(env, exports, "assignToJobObject", Assign);
  Export(env, exports, "killJobObject", Kill);
}

}  // namespace foo

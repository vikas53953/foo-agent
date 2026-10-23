# 15-minute real-person usability script

<!-- Scope: usability evaluation only; no product or spec changes. -->

This script is for a later evaluator using an isolated test profile with pretend data. It is exactly five tasks and is designed to expose comprehension, recovery, privacy and navigation issues. Do not coach the participant beyond the task text. Record the first action, hesitation, wrong turns, help requests, and whether the participant can explain what will happen next. Do not record real credentials, phone numbers, card numbers, OTPs, or personal messages.

## Run sheet

|        Time | Task                                                                                                                                                                      | What to watch for                                                                                                                                                                                                                                                                        |
| ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   0:00–2:30 | **1. Start and choose an AI.** From a fresh profile, open foo, press “Let’s go”, wait for the AI check, and choose the provider that says it works.                       | Does the person understand the setup step pill, provider states (“works”, “not found”, “looking”), and why the composer is unavailable before setup? Do they know what “Use Claude” changes and where to change it later?                                                                |
|   2:30–5:00 | **2. Ask, correct, and find a message.** Ask: “Wat is a VPN?” If needed, correct it to “What is a VPN?”, then search within the chat for “VPN” and open the second match. | Can they notice and correct the messy typo, tell their message from foo’s, see that the answer arrived, discover in-chat find, understand the result count/highlight, and return without losing context? Watch for a waiting strip or unrelated banner competing with the task.          |
|   5:00–7:30 | **3. Make a safe choice.** Ask for a restaurant booking, choose one option from the choice card, then stop the job before any booking.                                    | Do they recognise “BEST FIT”, know that a choice is not a payment, find Stop, understand “Nothing was booked, paid or sent”, and distinguish a stopped job from a job still waiting for an answer?                                                                                       |
|  7:30–10:00 | **4. Protect a secret.** Paste the safe synthetic fixture `sk-proj-7Hc2kLmN0pQrStUvWxYz12345678` into the composer and follow the safest offered path.                    | Does the warning clearly say what is at risk, can they choose the Secret box without fear, and is the value visibly absent from the normal message? Watch whether the warning offers a usable next step or leaves the participant stuck.                                                 |
| 10:00–12:00 | **5. Find a control and recover.** Open Settings, inspect Appearance, then try Notifications and Keyboard shortcuts. If a page is empty, explain what you would do next.  | Can the participant predict where settings live, tell which page is active, find the requested controls, and recover from a blank/failed page? Watch for blank right panes, stale waiting banners, raw error words, and whether the app explains loading, empty, error, or retry states. |

## Three questions afterwards

1. What did you expect foo to do at the moment you felt least sure?
2. Which words, status labels, or controls were confusing or made you worry that something had already happened?
3. If you could change one thing before using foo tomorrow, what would you change?

## Capture sheet

For each task, record completion (`completed`, `completed with help`, or `not completed`), first action, hesitation count, wrong path, exact participant wording, and screenshot path. Treat this as qualitative usability evidence only; it does not replace CI, real-AI evidence, accessibility testing, or owner acceptance.

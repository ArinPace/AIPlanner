# Local chat dictation

The Agent composer microphone uses the open-source Whisper tiny English model (`Xenova/whisper-tiny.en`) through Transformers.js and ONNX WebAssembly in a dedicated browser worker. Users do not install a companion app or provide an API key. First use downloads model/runtime files; model files can be cached by the browser. This feature is available to every planner user through the same web UI.

Click the microphone, allow browser microphone permission, speak, and click Stop. Dictation appends to the current draft, preserving typed text. It never sends a chat message automatically. English is currently supported; each capture is limited to approximately two minutes. An updated browser with microphone, MediaRecorder and WebAssembly support is required.

Audio is held temporarily in browser memory, processed on the user's device and not uploaded to the planner, Supabase, the VM, or a transcription API. It is not saved to disk by the app. External requests download only model/runtime files. Clicking Cancel, changing chats, leaving the Agent tab, or unmounting stops microphone tracks and discards pending output. Browser microphone permission is requested only after the user clicks the microphone.

Verification: a public JFK speech fixture through a simulated microphone transcribed the expected speech into an existing draft with no page errors. Cancel left the draft unchanged. Separate browser checks verified permission-denial handling, that switching chats ends all microphone tracks, and that the composer busy state clears. Production build passes; lint has only the two pre-existing TimeGridView warnings.

Upstream: https://github.com/huggingface/transformers.js and https://huggingface.co/Xenova/whisper-tiny.en . Their respective open-source licenses and model terms apply.

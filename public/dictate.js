/* Self-hosted dictation for the site-walk notes field.
   Records mic audio (MediaRecorder) → POST /admin/proposals/transcribe →
   self-hosted Whisper on spark → inserts the transcript into the textarea.
   No cloud STT, no SpeechRecognition (which would use Google's servers). */
(function () {
  var btn = document.getElementById("dictate-btn");
  var ta = document.getElementById("notes-textarea");
  var status = document.getElementById("dictate-status");
  if (!btn || !ta) return;

  var rec = null,
    chunks = [],
    recording = false;
  function setStatus(t) {
    if (status) status.textContent = t || "";
  }

  btn.addEventListener("click", function () {
    if (recording) {
      try {
        rec.stop();
      } catch (e) {}
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("recording not supported in this browser");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        try {
          rec = new MediaRecorder(stream);
        } catch (e) {
          rec = new MediaRecorder(stream, {});
        }
        chunks = [];
        rec.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        rec.onstop = function () {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          recording = false;
          btn.textContent = "🎤 Dictate";
          btn.classList.remove("rec");
          setStatus("Transcribing…");
          btn.disabled = true;
          var blob = new Blob(chunks, { type: (rec && rec.mimeType) || "audio/webm" });
          var fd = new FormData();
          fd.append("audio", blob, "note.webm");
          fetch("/admin/proposals/transcribe", { method: "POST", body: fd })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              btn.disabled = false;
              if (j && j.text) {
                ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + j.text;
                setStatus("✓ transcribed — review, then Generate");
                ta.focus();
              } else {
                setStatus((j && j.error) || "transcription failed");
              }
            })
            .catch(function () {
              btn.disabled = false;
              setStatus("transcription failed");
            });
        };
        rec.start();
        recording = true;
        btn.textContent = "⏹ Stop";
        btn.classList.add("rec");
        setStatus("● Recording… speak your site-walk notes, then click Stop");
      })
      .catch(function () {
        setStatus("microphone access denied");
      });
  });
})();

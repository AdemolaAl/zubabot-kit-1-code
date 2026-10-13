# Zubabot voice server (GPU). Build:  docker build -t zb-voice .     Run: see README.md
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 uninstall -y onnxruntime || true
# make sure only the GPU build of onnxruntime is installed (the CPU build would quietly win), and check it sees CUDA
RUN pip3 install --no-cache-dir --force-reinstall --no-deps "onnxruntime-gpu>=1.18,<1.23" \
 && python3 -c "import onnxruntime as o; p=o.get_available_providers(); print('onnxruntime providers:', p); assert 'CUDAExecutionProvider' in p"
RUN mkdir -p models && curl -fsSL -o models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
 && curl -fsSL -o models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
# download the listening model once at build time so the first call is fast
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"
COPY server.py .
EXPOSE 8090
CMD ["python3", "server.py"]

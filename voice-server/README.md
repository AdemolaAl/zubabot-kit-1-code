# Zubabot voice server (our own voices)

This is a small program that runs on a rented GPU computer. It makes the AI traders' voices (Kokoro, natural
American and British voices) and understands what users say (Whisper). The main Zubabot server talks to it.
Users never connect to it directly.

Why: inside Telegram on Android the phone's own voice and voice typing don't work, so calls must be heard and
spoken by a server. Doing it on our own GPU costs a flat monthly fee instead of paying per minute.

Without this server, calls still work through OpenAI / ElevenLabs keys (paid per minute). Add this server
whenever you're ready; the main server switches to it by itself.

## 1. Rent the GPU computer (about 15 minutes)
- Hetzner -> Dedicated -> GPU server **GEX44** (RTX 4000 Ada, 20 GB). Ubuntu 22.04 or 24.04.
  One handles about 40–60 people talking at the same time. Add a second one later for more (or as backup).
- Any NVIDIA GPU with 12 GB+ works (RunPod, Vast, Lambda, OVH...).

## 2. Install (about 30 minutes, copy-paste)
**Part A**, on the GPU computer as root (it ends with a restart):
```bash
apt update && apt install -y docker.io docker-compose-v2 git ubuntu-drivers-common openssl
V=$(ubuntu-drivers list --gpgpu 2>/dev/null | grep -o 'nvidia-driver-[0-9]*-server' | grep -o '[0-9]*' | sort -n | tail -1); echo "driver $V"
apt install -y nvidia-driver-$V-server nvidia-utils-$V-server
reboot
```
Wait 2 minutes and log in again. **Part B**:
```bash
nvidia-smi                                          # must show the GPU. If not, run Part A again
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia.gpg] https://#' > /etc/apt/sources.list.d/nvidia.list
apt update && apt install -y nvidia-container-toolkit && nvidia-ctk runtime configure --runtime=docker && systemctl restart docker
```
Copy this `voice-server` folder to the computer (from your laptop: `scp -r voice-server root@GPU_IP:/opt/`), then:
```bash
cd /opt/voice-server
cp .env.example .env
KEY=$(openssl rand -hex 24); sed -i "s/^VOICE_SERVER_KEY=.*/VOICE_SERVER_KEY=$KEY/" .env; echo "Your voice key: $KEY"   # copy it, you need it in step 4
docker compose up -d --build                        # first build downloads the models (~10 minutes)
docker compose logs | grep "voices run on"          # must say CUDAExecutionProvider
curl -H "Authorization: Bearer $KEY" http://localhost:8090/health
```

## 3. Lock it down (5 minutes)
Only the main Zubabot server should reach it. Docker skips UFW rules, so the block goes in Docker's own list, and a
small service puts it back after every restart (replace `1.2.3.4` with the MAIN server's IP):
```bash
MAIN=1.2.3.4
RULE="-p tcp -m conntrack --ctorigdstport 8090 ! -s $MAIN -j DROP"
printf '[Unit]\nAfter=docker.service\nRequires=docker.service\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=/bin/sh -c "iptables -C DOCKER-USER %s 2>/dev/null || iptables -I DOCKER-USER %s"\n[Install]\nWantedBy=multi-user.target\n' "$RULE" "$RULE" > /etc/systemd/system/voice-fw.service
systemctl daemon-reload && systemctl enable --now voice-fw
ufw allow ssh && ufw --force enable
```
Check from any other computer: `curl -m 5 http://GPU_IP:8090/health` must time out. The key protects it as well.

## 4. Connect it to Zubabot (2 minutes)
In the main server's `.env`:
```
# two servers: http://IP1:8090,http://IP2:8090
VOICE_SERVER_URL=http://GPU_IP:8090
VOICE_SERVER_KEY=the voice key from step 2
```
Restart Zubabot. Open **Admin -> AI engine & voice**: the voice server shows a green tick. Press **Play a test voice**.

## Voices
American: af_heart, af_bella, af_nicole, am_michael, am_adam, am_fenrir · British: bf_emma, bf_isabella, bm_george, bm_lewis.
Pick a voice per AI trader in Admin -> AI engine & voice -> Voices.

## Update it later
Copy the new `voice-server` folder over the old one (keep your `.env`), then `cd /opt/voice-server && docker compose up -d --build`.
Calls switch to the backup provider for the minute it restarts.

## Check it / fix it
- `docker compose logs -f` shows what it's doing. `docker compose restart` restarts it.
- /health shows `tts_on` (must be `CUDAExecutionProvider`), how many voices it made and how many are being made right now (`busy_tts`).
- If it's down, Zubabot automatically uses the next provider in the list (OpenAI / ElevenLabs) and alerts the team.

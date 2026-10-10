# HA test image: Python + Home Assistant (via pytest-homeassistant-custom-component).
# Built by scripts/test.sh; the repository is mounted on /app at run time.
FROM python:3.14-slim
WORKDIR /app
COPY tests/ha/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

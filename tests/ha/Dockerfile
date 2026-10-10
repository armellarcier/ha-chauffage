# HA test image: Python + Home Assistant (via pytest-homeassistant-custom-component).
# Built by scripts/test.sh; the repository is mounted on /app at run time.
#   REQUIREMENTS=tests/ha/requirements-min.txt → minimum supported Home Assistant
FROM python:3.14-slim
ARG REQUIREMENTS=tests/ha/requirements.txt
WORKDIR /app
COPY ${REQUIREMENTS} /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

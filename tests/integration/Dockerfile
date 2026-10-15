# HA test image: Python + Home Assistant (via pytest-homeassistant-custom-component).
# Built by scripts/test.sh; the repository is mounted on /app at run time.
#   REQUIREMENTS=tests/integration/requirements-min.txt PYTHON=python:3.13
#     → minimum supported Home Assistant, on its Python (full image: some of its
#       dependencies have no wheel and are compiled)
ARG PYTHON=python:3.14-slim
FROM ${PYTHON}
ARG REQUIREMENTS=tests/integration/requirements.txt
WORKDIR /app
COPY ${REQUIREMENTS} /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

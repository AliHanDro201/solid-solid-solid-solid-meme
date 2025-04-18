import eel
import os
import time
import logging

import elevenlabs as eleven
import webbrowser
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from utils.tts import stop_audio as tts_stop_audio
from core.gpt_service import generate_gpt_response, handle_user_input
from core.config import SECOND_OPENAI_API_KEY, ELEVENLABS_API_KEY
import tempfile

import base64, tempfile
from openai import OpenAI            #  v1.x   ← pip install --upgrade openai
client = OpenAI(api_key=os.getenv("SECOND_OPENAI_API_KEY"))
# ✅ Логгирование
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

# ✅ Загрузка переменных окружения
load_dotenv(dotenv_path=".env")
OpenAI.api_key = SECOND_OPENAI_API_KEY
if ELEVENLABS_API_KEY:
    eleven.set_api_key(ELEVENLABS_API_KEY)

# ✅ Глобальные переменные
executor = ThreadPoolExecutor(max_workers=1)
isRecognizing = False
# ✅ Функция для обработки текста
@eel.expose
def transcribe_audio(b64_audio: str) -> str:
    """
    JS отдаёт base‑64 строку (webm).
    Декодируем → временный файл → Whisper v3 («whisper‑1»).
    Возвращаем чистый текст.
    """
    data = base64.b64decode(b64_audio)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(data)
        tmp_path = tmp.name           # нужно открыть заново для чтения

    rsp = client.audio.transcriptions.create(
        model="whisper-1",
        file=open(tmp_path, "rb"),
        response_format="text"
    )
    return rsp  # это уже plain‑text

# ✅ Eel интерфейсные функции
@eel.expose
def stop_audio_ui():
    logger.info("Остановка аудио по запросу из UI")
    return tts_stop_audio()

@eel.expose
def process_input(text: str) -> str:
    response = handle_user_input(text)
    logger.info(f"Ответ, возвращаемый process_input: {response}")
    return response

# ✅ Основной запуск Eel

def main():
    eel.init('ui')

    eel.start('main.html')
    # 🕐 Пауза для загрузки интерфейса
    time.sleep(2)

    try:
        eel.muteAssistant()
        logger.info("🎙️ muteAssistant вызван из Python — ассистент молчит")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось вызвать muteAssistant: {e}")
    webbrowser.open("http://localhost:8000/main.html")
    # 🔁 Поддержка процесса
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("⛔ Приложение остановлено пользователем")


if __name__ == "__main__":
    main()

import asyncio
import json
from core.agent import async_chat_completion
from integrations.orchestrator import orchestrate_browser_chat

def handle_user_input(user_text: str) -> str:
    trigger = "обратись к gpt"
    if user_text.lower().startswith(trigger):
        query = user_text[len(trigger):].strip()
        if query:
            print(f"Обнаружен триггер, запрос для браузерного чата: {query}")
            result = orchestrate_browser_chat(query)
            print("Результат оркестрации:", result)
            return "Запрос выполнен через браузер."
        else:
            print("Не указан текст запроса после 'обратись к gpt'.")
            return "Ошибка: не указан запрос после 'обратись к gpt'."
    else:
        print("Обычный запрос:", user_text)
        return generate_gpt_response(user_text)

def generate_gpt_response(text: str) -> str:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(async_chat_completion(text))
    except Exception as e:
        print("Ошибка в generate_gpt_response:", e)
        return json.dumps({"status": 500, "statusMessage": str(e)})
    finally:
        loop.close()
    return json.dumps(result)

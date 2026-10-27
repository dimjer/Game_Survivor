"""Локальный сервер для игры: как `python3 -m http.server`, но запрещает браузеру кэш.

Без этого браузер (особенно Safari на iPhone) может взять один .js из кэша, а другой — свежий,
и игра падает с ошибкой или показывает чёрный экран.

Запуск из папки игры:  python3 serve.py   (порт 8000, доступен с телефона в той же Wi-Fi)
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


http.server.ThreadingHTTPServer(('0.0.0.0', PORT), NoCacheHandler).serve_forever()

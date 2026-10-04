#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT=8080
while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; do
    PORT=$((PORT + 1))
done

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "========================================================"
echo "          《金剛般若波羅蜜經》 隨身誦經網頁版          "
echo "========================================================"
echo ""
echo " 本機開啟網址:  http://localhost:${PORT}"
if [ "$IP" != "localhost" ]; then
    echo " 區域網路/手機: http://${IP}:${PORT}"
    echo " (同 Wi-Fi 下，用手機或平板掃描或輸入上述網址即可念經)"
fi
echo ""
echo " 按 Control + C 可關閉服務器。"
echo "========================================================"

# 自動在預設瀏覽器中開啟
open "http://localhost:${PORT}"

# 啟動 Python HTTP 伺服器
python3 -m http.server $PORT

#!/usr/bin/env bash
# 제미나이 이미지 API 실측 — v1/v1beta·무료 티어·응답 형태 확인 (키는 환경변수로, 커밋 금지)
set -euo pipefail

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "먼저 키를 환경변수로 설정한 뒤 다시 실행하세요(키는 화면·출력에 남지 않습니다):"
  echo '  export GEMINI_API_KEY="여기에_교사_키"'
  echo '  bash tools/verify-gemini.sh'
  exit 1
fi

MODEL="gemini-2.5-flash-image"
PROMPT="작은 빨간 사과 한 개, 부드러운 수채화 동화 그림체, 어린이 그림책 삽화, 연령 적합"
BODY="{\"contents\":[{\"parts\":[{\"text\":\"$PROMPT\"}]}],\"generationConfig\":{\"responseModalities\":[\"TEXT\",\"IMAGE\"]}}"

for VER in v1beta v1; do
  echo "──────── $VER ────────"
  RESP=$(curl -s -w $'\n__HTTP__%{http_code}' \
    "https://generativelanguage.googleapis.com/$VER/models/$MODEL:generateContent" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" || true)
  CODE=$(printf '%s' "$RESP" | sed -n 's/.*__HTTP__//p')
  JSON_BODY=$(printf '%s' "$RESP" | sed 's/__HTTP__[0-9]*$//')
  echo "HTTP: ${CODE:-?}"
  printf '%s' "$JSON_BODY" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let d;try{d=JSON.parse(s)}catch(e){console.log("  (JSON 파싱 실패)");return;}
      if(d.error){console.log("  오류:",d.error.status||"",("| "+(d.error.message||"")).slice(0,160));return;}
      let img=null;(d.candidates||[]).forEach(c=>((c.content&&c.content.parts)||[]).forEach(p=>{const i=p.inlineData||p.inline_data;if(i&&i.data)img=i;}));
      if(img)console.log("  ✅ 이미지 수신 | mime:",img.mimeType||img.mime_type,"| base64 길이:",img.data.length);
      else console.log("  ⚠️ 이미지 없음(텍스트만?) | 응답 키:",Object.keys(d).join(","));
    });' || echo "  (node 파싱 실패)"
  echo
done
echo "→ ✅ 가 뜬 버전이 정답입니다. 그 결과(HTTP/✅/⚠️/오류 메시지)만 알려주세요(키는 빼고)."

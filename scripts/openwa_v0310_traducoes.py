#!/usr/bin/env python3
"""Apply 47 proposed OpenWA translations to each of 7 non-Latin locales.

Offline only. Does not send WhatsApp messages or touch production.
Dry-run: python3 openwa_v0310_traducoes.py --worktree /opt/openwa-v0310-integration-20261121
Apply:   python3 openwa_v0310_traducoes.py --worktree /opt/openwa-v0310-integration-20261121 --apply
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

KEYS = """messageTester.bulkPersonalization.mode
messageTester.bulkPersonalization.modes.same
messageTester.bulkPersonalization.modes.personalized
messageTester.bulkPersonalization.modes.random
messageTester.bulkPersonalization.hint
messageTester.bulkPersonalization.perRecipient
messageTester.bulkPersonalization.importCsv
messageTester.bulkPersonalization.csvHint
messageTester.bulkPersonalization.phone
messageTester.bulkPersonalization.message
messageTester.bulkPersonalization.remove
messageTester.bulkPersonalization.addRow
messageTester.bulkPersonalization.variations
messageTester.bulkPersonalization.randomHint
messageTester.bulkPersonalization.variation
messageTester.bulkPersonalization.addVariation
messageTester.bulkPersonalization.save
messageTester.bulkPersonalization.clear
messageTester.bulkPersonalization.browserOnly
messageTester.bulkPersonalization.saved
messageTester.bulkPersonalization.cleared
messageTester.bulkPersonalization.preview
messageTester.bulkPersonalization.previewMore
messageTester.bulkPersonalization.errors.fileTooLarge
messageTester.bulkPersonalization.errors.readError
messageTester.bulkPersonalization.errors.invalidCsv
messageTester.bulkPersonalization.errors.invalidHeader
messageTester.bulkPersonalization.errors.invalidRecipient
messageTester.bulkPersonalization.errors.emptyMessage
messageTester.bulkPersonalization.errors.longMessage
messageTester.bulkPersonalization.errors.invalidCount
messageTester.bulkPersonalization.errors.duplicateRecipient
messageTester.bulkPersonalization.errors.invalidVariations
messageTester.bulkPersonalization.errors.needVariations
messageTester.bulkPersonalization.errors.storageUnavailable
messageTester.bulkPacing.mode
messageTester.bulkPacing.random
messageTester.bulkPacing.blocks
messageTester.bulkPacing.custom
messageTester.bulkPacing.randomHint
messageTester.bulkPacing.size
messageTester.bulkPacing.sequence
messageTester.bulkPacing.blocksHint
messageTester.bulkPacing.customHint
messageTester.bulkPacing.errors.invalidSize
messageTester.bulkPacing.errors.invalidSequence
messageTester.bulkPacing.errors.invalidCustom""".splitlines()
TRANSLATIONS = """[ar]
وضع الإرسال الجماعي
الرسالة نفسها للجميع
رسالة لكل مستلم
رسائل محفوظة عشوائية
اختر كيف يتلقى كل مستلم رسالته.
المستلمون والرسائل
استيراد CSV
ملف CSV بترميز UTF-8 مع العناوين numero;mensagem أو phone,message. يمكن للنص بين علامتي اقتباس أن يحتوي على فواصل وأسطر جديدة.
رقم الهاتف {{index}}
الرسالة
إزالة
إضافة مستلم
أشكال الرسائل المحفوظة
أدخل رسالتين مختلفتين على الأقل. يخلط النظام الترتيب في كل دورة دون تكرار الشكل نفسه مباشرةً، ويعرض معاينة قبل الإرسال.
الرسالة {{index}}
إضافة رسالة
حفظ في هذا المتصفح
حذف المحفوظ
تبقى النصوص المحفوظة في الملف الشخصي المحلي لهذا المتصفح ولا تُزامن مع الخادم. تجنب المعلومات الحساسة.
حُفظت الرسائل في هذا المتصفح.
حُذفت المجموعة المحفوظة. تبقى النصوص المفتوحة في المحرر.
معاينة {{count}} عملية إرسال
... و{{count}} مستلمًا آخر.
ملف CSV كبير جدًا (الحد الأقصى 2 ميغابايت).
تعذرت قراءة ملف CSV.
ملف CSV غير صالح: تحقق من علامات الاقتباس والحقول والفواصل.
يجب أن يحتوي CSV على عمودي numero (أو phone) وmensagem (أو message).
رقم غير صالح: أدخل رقم هاتف دوليًا أو معرّف محادثة واتساب.
يجب أن تكون لكل مستلم رسالة غير فارغة.
تتجاوز إحدى الرسائل 4,096 حرفًا.
أدخل من 1 إلى 100 مستلم.
يجب معالجة أرقام الهواتف المكررة قبل الإرسال.
الحد الأقصى 30 صيغة للرسائل.
أدخل رسالتين مختلفتين على الأقل.
تعذر على المتصفح حفظ الرسائل.
كيف ينبغي حساب الوقت بين عمليات الإرسال؟
عشوائي من 0 إلى 5 دقائق (الحالي)
دورة ثابتة حسب مجموعة المستلمين
تأخير مخصص بالمللي ثانية
يحافظ على السلوك الحالي: تُختار كل فترة توقف بشكل مستقل بين 0 و5 دقائق.
عدد الرسائل لكل مجموعة
التأخير لكل مجموعة (بالدقائق)
مثال: 5 رسائل بفاصل دقيقتين، ثم 5 بفاصل 3 دقائق، ثم 4 و5 ودقيقة واحدة. تتكرر الدورة بعد المجموعة الأخيرة. لا يوجد تأخير بعد الرسالة الأخيرة.
من 1,000 إلى 60,000 مللي ثانية مع تفاوت أصلي يصل إلى ثانيتين.
أدخل عددًا صحيحًا من 1 إلى 100 رسالة لكل مجموعة.
أدخل من 1 إلى 10 فترات تأخير صحيحة من 1 إلى 5 دقائق، تفصل بينها فواصل.
أدخل عددًا صحيحًا من 1,000 إلى 60,000 مللي ثانية.
[he]
מצב שליחה בתפוצה
אותה הודעה לכולם
הודעה לכל נמען
הודעות שמורות באקראי
בחר כיצד כל נמען יקבל את ההודעה שלו.
נמענים והודעות
ייבוא CSV
קובץ CSV בקידוד UTF-8 עם כותרות numero;mensagem או phone,message. טקסט במירכאות יכול לכלול פסיקים ומעברי שורה.
טלפון {{index}}
הודעה
הסרה
הוספת נמען
גרסאות הודעה שמורות
יש להזין לפחות שתי הודעות שונות. המערכת מערבבת אותן בכל מחזור בלי לחזור מיד על אותה גרסה ומציגה תצוגה מקדימה לפני השליחה.
הודעה {{index}}
הוספת הודעה
שמירה בדפדפן זה
מחיקת השמורות
הטקסטים השמורים נשארים בפרופיל המקומי של הדפדפן ואינם מסונכרנים עם השרת. הימנע ממידע רגיש.
ההודעות נשמרו בדפדפן זה.
הקבוצה השמורה נמחקה. הטקסטים הפתוחים בעורך נשארו.
תצוגה מקדימה של {{count}} שליחות
... ועוד {{count}} נמענים.
קובץ ה-CSV גדול מדי (מקסימום 2 MB).
לא ניתן לקרוא את קובץ ה-CSV.
קובץ CSV לא תקין: בדוק מירכאות, שדות ומפרידים.
קובץ ה-CSV חייב לכלול עמודות numero (או phone) ו-mensagem (או message).
מספר לא תקין: הזן מספר טלפון בינלאומי או מזהה צ'אט של WhatsApp.
לכל נמען חייבת להיות הודעה שאינה ריקה.
הודעה אחת חורגת מ-4,096 תווים.
הזן בין נמען אחד ל-100 נמענים.
יש לפתור כפילויות במספרי הטלפון לפני השליחה.
עד 30 גרסאות הודעה.
הזן לפחות שתי הודעות שונות.
הדפדפן לא הצליח לשמור את ההודעות.
כיצד לחשב את הזמן בין השליחות?
אקראי בין 0 ל-5 דקות (המצב הקיים)
מחזור קבוע לפי קבוצת נמענים
השהיה מותאמת אישית באלפיות שנייה
שומר על ההתנהגות הקיימת: כל מרווח נבחר בנפרד בין 0 ל-5 דקות.
הודעות בכל קבוצה
השהיה לכל קבוצה (דקות)
לדוגמה: 5 הודעות במרווח של 2 דקות, 5 הבאות במרווח של 3 דקות, ואז 4, 5 ודקה אחת. המחזור חוזר אחרי הקבוצה האחרונה. אין השהיה לאחר ההודעה האחרונה.
מ-1,000 עד 60,000 אלפיות שנייה, עם סטייה קיימת של עד 2 שניות.
הזן מספר שלם בין 1 ל-100 הודעות לכל קבוצה.
הזן 1 עד 10 מרווחים שלמים בין 1 ל-5 דקות, מופרדים בפסיקים.
הזן מספר שלם בין 1,000 ל-60,000 אלפיות שנייה.
[hi]
बल्क भेजने का मोड
सभी को एक ही संदेश
प्रत्येक प्राप्तकर्ता के लिए अलग संदेश
सहेजे गए संदेशों का यादृच्छिक चयन
चुनें कि प्रत्येक प्राप्तकर्ता को उसका संदेश कैसे मिलेगा।
प्राप्तकर्ता और संदेश
CSV आयात करें
UTF-8 CSV में numero;mensagem या phone,message शीर्षक हों। उद्धरण चिह्नों में लिखा पाठ अल्पविराम और नई पंक्तियाँ रख सकता है।
फ़ोन {{index}}
संदेश
हटाएँ
प्राप्तकर्ता जोड़ें
सहेजे गए संदेशों के विकल्प
कम से कम दो अलग संदेश दर्ज करें। डैशबोर्ड हर चक्र में क्रम बदलता है, तुरंत एक ही विकल्प नहीं दोहराता और भेजने से पहले पूर्वावलोकन दिखाता है।
संदेश {{index}}
संदेश जोड़ें
इस ब्राउज़र में सहेजें
सहेजे गए संदेश मिटाएँ
सहेजा गया पाठ इसी ब्राउज़र की स्थानीय प्रोफ़ाइल में रहता है और सर्वर से सिंक नहीं होता। संवेदनशील जानकारी से बचें।
संदेश इस ब्राउज़र में सहेजे गए।
सहेजा गया सेट मिटा दिया गया। संपादक में खुले संदेश बने रहेंगे।
{{count}} भेजे जाने वाले संदेशों का पूर्वावलोकन
... और {{count}} अन्य प्राप्तकर्ता।
CSV बहुत बड़ी है (अधिकतम 2 MB)।
CSV पढ़ी नहीं जा सकी।
अमान्य CSV: उद्धरण चिह्न, फ़ील्ड और विभाजक जाँचें।
CSV में numero (या phone) और mensagem (या message) स्तंभ होने चाहिए।
अमान्य नंबर: अंतरराष्ट्रीय फ़ोन नंबर या WhatsApp चैट आईडी दर्ज करें।
हर प्राप्तकर्ता के लिए संदेश खाली नहीं होना चाहिए।
एक संदेश 4,096 अक्षरों से अधिक है।
1 से 100 प्राप्तकर्ता दर्ज करें।
भेजने से पहले दोहराए गए फ़ोन नंबर ठीक करें।
अधिकतम 30 संदेश विकल्प।
कम से कम दो अलग संदेश दर्ज करें।
ब्राउज़र संदेशों को सहेज नहीं सका।
भेजने के बीच का अंतराल कैसे तय किया जाए?
यादृच्छिक 0–5 मिनट (मौजूदा)
प्राप्तकर्ता समूह के अनुसार निश्चित चक्र
मिलीसेकंड में मनचाहा विलंब
मौजूदा व्यवहार बनाए रखता है: हर अंतराल 0 से 5 मिनट के बीच अलग-अलग चुना जाता है।
प्रति समूह संदेश
प्रत्येक समूह का विलंब (मिनट)
उदाहरण: 5 संदेशों के बीच 2 मिनट, अगले 5 के बीच 3 मिनट, फिर 4, 5 और 1 मिनट। आखिरी समूह के बाद चक्र दोहरता है। आखिरी संदेश के बाद विलंब नहीं होता।
1,000 से 60,000 मिलीसेकंड, मौजूदा अधिकतम 2 सेकंड की यादृच्छिक भिन्नता के साथ।
प्रति समूह 1 से 100 संदेशों के बीच पूर्णांक दर्ज करें।
अल्पविराम से अलग 1 से 10 पूर्णांक विलंब दर्ज करें, प्रत्येक 1 से 5 मिनट का।
1,000 से 60,000 मिलीसेकंड के बीच पूर्णांक दर्ज करें।
[ko]
대량 전송 방식
모두에게 같은 메시지 보내기
수신자별 메시지
저장된 메시지 무작위 선택
각 수신자에게 메시지를 전달할 방식을 선택하세요.
수신자와 메시지
CSV 가져오기
UTF-8 CSV의 헤더는 numero;mensagem 또는 phone,message여야 합니다. 따옴표로 감싼 텍스트에는 쉼표와 줄바꿈을 넣을 수 있습니다.
전화번호 {{index}}
메시지
삭제
수신자 추가
저장된 메시지 변형
서로 다른 메시지를 두 개 이상 입력하세요. 대시보드는 매 주기마다 순서를 섞고 같은 내용을 바로 반복하지 않으며 전송 전에 미리 보여 줍니다.
메시지 {{index}}
메시지 추가
이 브라우저에 저장
저장된 항목 삭제
저장한 텍스트는 이 브라우저의 로컬 프로필에만 남으며 서버와 동기화되지 않습니다. 민감한 정보는 저장하지 마세요.
메시지가 이 브라우저에 저장되었습니다.
저장된 묶음을 삭제했습니다. 편집기에 열려 있는 텍스트는 유지됩니다.
전송 {{count}}건 미리보기
... 외 수신자 {{count}}명.
CSV 파일이 너무 큽니다(최대 2 MB).
CSV 파일을 읽을 수 없습니다.
잘못된 CSV: 따옴표, 필드와 구분자를 확인하세요.
CSV에는 numero(또는 phone)와 mensagem(또는 message) 열이 있어야 합니다.
잘못된 번호: 국제 전화번호 또는 WhatsApp 채팅 ID를 입력하세요.
모든 수신자에게 비어 있지 않은 메시지가 필요합니다.
메시지가 4,096자를 초과했습니다.
수신자를 1명에서 100명까지 입력하세요.
전송 전에 중복된 전화번호를 해결하세요.
메시지 변형은 최대 30개입니다.
서로 다른 메시지를 두 개 이상 입력하세요.
브라우저에서 메시지를 저장하지 못했습니다.
전송 간격을 어떻게 계산할까요?
무작위 0~5분(기존 방식)
수신자 그룹별 고정 주기
밀리초 단위 사용자 지정 지연
기존 방식 유지: 각 간격을 0~5분 사이에서 독립적으로 선택합니다.
그룹당 메시지 수
그룹별 지연(분)
예: 5건마다 2분 간격, 다음 5건은 3분 간격, 그다음은 4분, 5분, 1분입니다. 마지막 그룹 이후 처음부터 반복합니다. 마지막 메시지 뒤에는 지연하지 않습니다.
1,000~60,000ms, 기존 최대 2초의 무작위 오차가 적용됩니다.
그룹당 메시지 수를 1~100 사이의 정수로 입력하세요.
쉼표로 구분한 1~10개의 지연 시간을 입력하세요. 각각 1~5분의 정수여야 합니다.
1,000~60,000ms 사이의 정수를 입력하세요.
[te]
సమూహ పంపిణీ విధానం
అందరికీ ఒకే సందేశం
ప్రతి గ్రహీతకు వేర్వేరు సందేశం
సేవ్ చేసిన సందేశాలు యాదృచ్ఛికంగా
ప్రతి గ్రహీతకు సందేశం ఎలా పంపాలో ఎంచుకోండి.
గ్రహీతలు మరియు సందేశాలు
CSV దిగుమతి
UTF-8 CSVలో numero;mensagem లేదా phone,message శీర్షికలు ఉండాలి. కొటేషన్‌లో ఉన్న వచనంలో కామాలు, కొత్త పంక్తులు ఉండవచ్చు.
ఫోన్ {{index}}
సందేశం
తొలగించు
గ్రహీతను జోడించు
సేవ్ చేసిన సందేశాల వైవిధ్యాలు
కనీసం రెండు వేర్వేరు సందేశాలు ఇవ్వండి. డ్యాష్‌బోర్డ్ ప్రతి చక్రంలో వాటిని కలిపి, ఒకే సందేశం వెంటనే పునరావృతం కాకుండా చేసి, పంపే ముందు చూపిస్తుంది.
సందేశం {{index}}
సందేశాన్ని జోడించు
ఈ బ్రౌజర్‌లో సేవ్ చేయి
సేవ్ చేసినవి తొలగించు
సేవ్ చేసిన వచనం ఈ బ్రౌజర్ స్థానిక ప్రొఫైల్‌లోనే ఉంటుంది; సర్వర్‌తో సమకాలీకరించబడదు. సున్నితమైన సమాచారం ఇవ్వవద్దు.
సందేశాలు ఈ బ్రౌజర్‌లో సేవ్ అయ్యాయి.
సేవ్ చేసిన సముదాయం తొలగించబడింది. ఎడిటర్‌లో ఉన్న వచనం అలాగే ఉంటుంది.
{{count}} పంపింపుల ముందస్తు వీక్షణ
... ఇంకా {{count}} మంది గ్రహీతలు.
CSV ఫైల్ చాలా పెద్దది (గరిష్ఠం 2 MB).
CSV చదవడం సాధ్యపడలేదు.
చెల్లని CSV: కొటేషన్లు, ఫీల్డ్‌లు, విభాజకాలను తనిఖీ చేయండి.
CSVలో numero (లేదా phone), mensagem (లేదా message) కాలమ్‌లు ఉండాలి.
చెల్లని నంబర్: అంతర్జాతీయ ఫోన్ నంబర్ లేదా WhatsApp చాట్ ID ఇవ్వండి.
ప్రతి గ్రహీతకు ఖాళీ కాని సందేశం అవసరం.
ఒక సందేశం 4,096 అక్షరాలను మించిపోయింది.
1 నుండి 100 మంది గ్రహీతలను నమోదు చేయండి.
పంపే ముందు నకిలీ ఫోన్ నంబర్లను పరిష్కరించండి.
గరిష్ఠంగా 30 సందేశ వైవిధ్యాలు.
కనీసం రెండు వేర్వేరు సందేశాలు నమోదు చేయండి.
బ్రౌజర్ సందేశాలను సేవ్ చేయలేకపోయింది.
పంపింపుల మధ్య సమయాన్ని ఎలా లెక్కించాలి?
యాదృచ్ఛికంగా 0–5 నిమిషాలు (ప్రస్తుత విధానం)
గ్రహీతల సమూహం ప్రకారం స్థిర చక్రం
మిల్లీసెకన్లలో అనుకూల ఆలస్యం
ప్రస్తుత విధానం కొనసాగుతుంది: ప్రతి విరామం 0 నుండి 5 నిమిషాల మధ్య స్వతంత్రంగా ఎంపికవుతుంది.
ఒక్కో సమూహానికి సందేశాలు
ఒక్కో సమూహానికి ఆలస్యం (నిమిషాలు)
ఉదాహరణ: 5 సందేశాలకు 2 నిమిషాల విరామం, తదుపరి 5కు 3 నిమిషాలు, ఆపై 4, 5, 1 నిమిషం. చివరి సమూహం తర్వాత మళ్లీ మొదలవుతుంది. చివరి సందేశం తర్వాత విరామం ఉండదు.
1,000 నుండి 60,000 మిల్లీసెకన్లు; మునుపటి విధానంలా గరిష్ఠంగా 2 సెకన్ల యాదృచ్ఛిక మార్పుతో.
ఒక్కో సమూహానికి 1 నుండి 100 సందేశాల మధ్య పూర్ణసంఖ్య ఇవ్వండి.
కామాలతో వేరు చేసి, 1 నుండి 5 నిమిషాల వ్యవధితో 1 నుండి 10 పూర్ణసంఖ్యల ఆలస్యాలను ఇవ్వండి.
1,000 నుండి 60,000 మిల్లీసెకన్ల మధ్య పూర్ణసంఖ్య ఇవ్వండి.
[zh-CN]
批量发送模式
向所有人发送相同消息
按收件人发送不同消息
随机选择已保存的消息
选择每位收件人接收消息的方式。
收件人和消息
导入 CSV
UTF-8 CSV 的表头须为 numero;mensagem 或 phone,message。引号中的文本可以包含逗号和换行。
电话号码 {{index}}
消息
移除
添加收件人
已保存的消息变体
请至少输入两条不同消息。面板每轮随机打乱顺序，避免连续重复同一条，并在发送前显示预览。
消息 {{index}}
添加消息
保存到此浏览器
删除已保存内容
保存的文本仅保留在此浏览器的本地配置中，不会同步到服务器。请勿保存敏感信息。
消息已保存到此浏览器。
已删除保存的消息集。编辑器中当前的文本仍会保留。
预览 {{count}} 次发送
……以及另外 {{count}} 位收件人。
CSV 文件过大（最大 2 MB）。
无法读取 CSV 文件。
CSV 无效：请检查引号、字段和分隔符。
CSV 必须包含 numero（或 phone）和 mensagem（或 message）列。
号码无效：请输入国际电话号码或 WhatsApp 聊天 ID。
每位收件人都必须有非空消息。
某条消息超过 4,096 个字符。
请输入 1 至 100 位收件人。
发送前请处理重复的电话号码。
最多支持 30 种消息变体。
请至少输入两条不同消息。
浏览器无法保存消息。
如何计算每次发送之间的间隔？
随机 0–5 分钟（现有方式）
按收件人分组固定循环
自定义延迟（毫秒）
保持现有行为：每个间隔独立从 0 到 5 分钟中随机选择。
每组消息数
各组延迟（分钟）
例如：前 5 条间隔 2 分钟，接下来 5 条间隔 3 分钟，然后依次为 4、5 和 1 分钟。最后一组之后重新循环。最后一条消息发送后不再延迟。
1,000 至 60,000 毫秒，保留原有最多 2 秒的随机浮动。
请输入 1 至 100 之间的整数作为每组消息数。
请输入 1 至 10 个用逗号分隔的整数延迟值，每个为 1 至 5 分钟。
请输入 1,000 至 60,000 之间的整数（毫秒）。
[zh-HK]
批量傳送模式
向所有人傳送相同訊息
按收件人傳送不同訊息
隨機選擇已儲存的訊息
選擇每位收件人接收訊息的方式。
收件人與訊息
匯入 CSV
UTF-8 CSV 的欄位標題須為 numero;mensagem 或 phone,message。引號內的文字可包含逗號及換行。
電話號碼 {{index}}
訊息
移除
新增收件人
已儲存的訊息變體
請至少輸入兩則不同訊息。面板每輪隨機打亂次序，避免連續重複同一則，並於傳送前提供預覽。
訊息 {{index}}
新增訊息
儲存至此瀏覽器
刪除已儲存內容
儲存的文字只保留在此瀏覽器的本機設定中，不會同步至伺服器。請勿儲存敏感資料。
訊息已儲存至此瀏覽器。
已刪除儲存的訊息集。編輯器中目前的文字會保留。
預覽 {{count}} 次傳送
……以及另外 {{count}} 位收件人。
CSV 檔案過大（上限 2 MB）。
無法讀取 CSV 檔案。
CSV 無效：請檢查引號、欄位及分隔符。
CSV 必須包含 numero（或 phone）及 mensagem（或 message）欄。
號碼無效：請輸入國際電話號碼或 WhatsApp 聊天 ID。
每位收件人都必須有非空訊息。
有訊息超過 4,096 個字元。
請輸入 1 至 100 位收件人。
傳送前請處理重複的電話號碼。
最多支援 30 種訊息變體。
請至少輸入兩則不同訊息。
瀏覽器無法儲存訊息。
如何計算每次傳送之間的間隔？
隨機 0–5 分鐘（現有方式）
按收件人群組固定循環
自訂延遲（毫秒）
保留現有行為：每個間隔都獨立從 0 至 5 分鐘中隨機選擇。
每組訊息數
各組延遲（分鐘）
例如：前 5 則間隔 2 分鐘，接下來 5 則間隔 3 分鐘，然後依次為 4、5 及 1 分鐘。最後一組之後重新循環。最後一則訊息傳送後不再延遲。
1,000 至 60,000 毫秒，保留原有最多 2 秒的隨機浮動。
請輸入 1 至 100 之間的整數作為每組訊息數。
請輸入 1 至 10 個以逗號分隔的整數延遲值，每個為 1 至 5 分鐘。
請輸入 1,000 至 60,000 之間的整數（毫秒）。"""


def get(obj, path):
    for k in path.split('.'):
        obj = obj[k]
    return obj


def setvalue(obj, path, value):
    parts = path.split('.')
    parent = obj
    for part in parts[:-1]:
        parent = parent[part]
    parent[parts[-1]] = value


def tokens(text):
    return sorted(re.findall(r'\{\{[^{}]+\}\}', text))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worktree', type=Path, required=True)
    parser.add_argument('--apply', action='store_true', help='make verified edits after backups')
    args = parser.parse_args()
    work = args.worktree.resolve(strict=True)
    root = work / 'dashboard' / 'src' / 'i18n' / 'locales'
    assert root.is_dir(), root
    version = json.loads((work / 'package.json').read_text())['version']
    assert version == '0.31.0', f'Expected 0.31.0, found {version}'
    merge_head = subprocess.run(['git', '-C', str(work), 'rev-parse', '-q', '--verify', 'MERGE_HEAD'],
                                capture_output=True, text=True)
    assert merge_head.returncode == 0, 'Expected isolated worktree with merge in progress'
    unmerged = subprocess.check_output(['git', '-C', str(work), 'diff', '--name-only', '--diff-filter=U'], text=True)
    assert not unmerged.strip(), 'Resolve conflicts before applying translations'
    en = json.loads((root / 'en.json').read_text())
    plan = {}
    blocks = re.findall(r'^\[([^\]]+)\]\n(.*?)(?=^\[|\Z)', TRANSLATIONS, re.S | re.M)
    assert len(blocks) == 7, f'Expected 7 languages; found {len(blocks)}'
    for lang, block in blocks:
        entries = block.rstrip('\n').splitlines()
        assert len(entries) == len(KEYS) == 47, (lang, len(entries))
        path = root / f'{lang}.json'
        data = json.loads(path.read_text())
        for key, value in zip(KEYS, entries):
            source = get(en, key)
            prior = get(data, key)
            assert prior == source, f'Unexpected existing translation {lang} {key}: {prior!r}'
            assert value != source and value.strip(), f'Untranslated entry {lang}: {key}'
            assert tokens(value) == tokens(source), f'Interpolation mismatch {lang}: {key}'
            setvalue(data, key, value)
        encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        assert json.loads(encoded) == data
        plan[path] = encoded
        print(f'VALIDADO: {lang}, {len(entries)} traducoes, parametros preservados')
    print(f'Total: {len(plan)*len(KEYS)} traducoes em {len(plan)} arquivos')
    if not args.apply:
        print('MODO DE VERIFICACAO: nenhum arquivo alterado. Use --apply para gravar.')
        return

    backup = Path('/root') / ('openwa-v0310-locales-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    for original in plan:
        shutil.copy2(original, backup / original.name)
    print('Backup:', backup)
    for original, body in plan.items():
        fd, tmp_name = tempfile.mkstemp(prefix=f'.{original.name}.', dir=original.parent)
        try:
            os.fchmod(fd, original.stat().st_mode & 0o777)
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                out.write(body)
                out.flush()
                os.fsync(out.fileno())
            os.replace(tmp_name, original)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        print('TRADUZIDO:', original.name)
    subprocess.run(['git', '-C', str(work), 'diff', '--check'], check=True)
    print('CORRECAO CONCLUIDA. AINDA E NECESSARIO RODAR A REGRESSAO.')


if __name__ == '__main__':
    main()
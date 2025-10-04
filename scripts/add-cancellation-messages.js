const fs = require("fs");
const path = require("path");

const cancellationMessages = {
    ar: { status: "ملغى", description: "تم إلغاء هذا الاستلام. لا تحتاج إلى الحضور." },
    de: {
        status: "Abgesagt",
        description: "Diese Abholung wurde abgesagt. Sie müssen nicht kommen.",
    },
    el: {
        status: "Ακυρώθηκε",
        description: "Αυτή η παραλαβή έχει ακυρωθεί. Δεν χρειάζεται να έρθετε.",
    },
    es: { status: "Cancelada", description: "Esta recogida ha sido cancelada. No necesita venir." },
    fa: { status: "لغو شده", description: "این دریافت لغو شده است. نیازی به آمدن ندارید." },
    fi: { status: "Peruttu", description: "Tämä nouto on peruttu. Sinun ei tarvitse tulla." },
    fr: {
        status: "Annulée",
        description: "Ce retrait a été annulé. Vous n'avez pas besoin de venir.",
    },
    hy: { status: "Չեղարկված", description: "Այս վերցնելը չեղարկվել է: Դուք պարտադիր չէ գաք:" },
    it: {
        status: "Annullato",
        description: "Questo ritiro è stato annullato. Non è necessario venire.",
    },
    ka: { status: "გაუქმებულია", description: "ეს აღება გაუქმებულია. თქვენ არ გჭირდებათ მოსვლა." },
    ku: { status: "Betalkirin", description: "Ev hilgirtin hate betalkirin. Tu divê nehêyi." },
    pl: { status: "Odwołane", description: "Ten odbiór został odwołany. Nie musisz przychodzić." },
    ru: { status: "Отменено", description: "Эта выдача отменена. Вам не нужно приходить." },
    so: {
        status: "La joojiyay",
        description: "Qaadashadan waa la joojiyay. Uma baahnid inaad timaaddo.",
    },
    so_so: {
        status: "La joojiyay",
        description: "Qaadashadan waa la joojiyay. Uma baahnid inaad timaaddo.",
    },
    sw: { status: "Imesitishwa", description: "Uchukuzi huu umesitishwa. Huhitaji kuja." },
    th: { status: "ถูกยกเลิก", description: "การรับนี้ถูกยกเลิกแล้ว คุณไม่จำเป็นต้องมา" },
    uk: { status: "Скасовано", description: "Це отримання скасовано. Вам не потрібно приходити." },
    vi: { status: "Đã hủy", description: "Lần lấy này đã bị hủy. Bạn không cần đến." },
};

const files = Object.keys(cancellationMessages);

files.forEach(lang => {
    const filePath = path.join(__dirname, "..", "messages", `public-${lang}.json`);

    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const cancelMsg = cancellationMessages[lang];

        if (data.publicParcel && data.publicParcel.status) {
            if (data.publicParcel.status.cancelled) {
                console.log(`⏭️  Skipped public-${lang}.json (already has cancelled status)`);
            } else {
                data.publicParcel.status.cancelled = cancelMsg.status;
                data.publicParcel.statusDescription.cancelled = cancelMsg.description;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + "\n");
                console.log(`✅ Updated public-${lang}.json`);
            }
        } else {
            console.log(`⚠️  Skipped public-${lang}.json (missing publicParcel structure)`);
        }
    } catch (err) {
        console.error(`❌ Failed to update public-${lang}.json:`, err.message);
    }
});

console.log("\n✨ Done!");

/**
 * SMS message templates for different locales and intents
 */

export interface SmsTemplateData {
    householdName: string;
    pickupDate: string;
    pickupTime: string;
    locationName: string;
    locationAddress: string;
    publicUrl: string;
}

export function formatPickupReminderSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Hej ${householdName}! Du har ett matpaket att hämta ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `مرحبا ${householdName}! لديك طرد طعام للاستلام في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "fa":
            return `سلام ${householdName}! شما یک بسته غذا برای تحویل در ${pickupDate} در ${pickupTime} در ${locationName}، ${locationAddress} دارید. اطلاعات بیشتر: ${publicUrl}`;

        case "ku":
            return `Silav ${householdName}! Tu pakêteke xwarinê heye ku di ${pickupDate} de di ${pickupTime} de li ${locationName}, ${locationAddress} hilgirî. Agahdariya zêdetir: ${publicUrl}`;

        case "es":
            return `¡Hola ${householdName}! Tienes un paquete de comida para recoger el ${pickupDate} a las ${pickupTime} en ${locationName}, ${locationAddress}. Más información: ${publicUrl}`;

        case "fr":
            return `Bonjour ${householdName}! Vous avez un colis alimentaire à récupérer le ${pickupDate} à ${pickupTime} à ${locationName}, ${locationAddress}. Plus d'infos: ${publicUrl}`;

        case "de":
            return `Hallo ${householdName}! Sie haben ein Lebensmittelpaket am ${pickupDate} um ${pickupTime} bei ${locationName}, ${locationAddress} abzuholen. Mehr Infos: ${publicUrl}`;

        case "el":
            return `Γεια σας ${householdName}! Έχετε ένα πακέτο φαγητού να παραλάβετε στις ${pickupDate} στις ${pickupTime} στο ${locationName}, ${locationAddress}. Περισσότερες πληροφορίες: ${publicUrl}`;

        case "sw":
            return `Hujambo ${householdName}! Una kifurushi cha chakula cha kuchukua tarehe ${pickupDate} saa ${pickupTime} huko ${locationName}, ${locationAddress}. Maelezo zaidi: ${publicUrl}`;

        case "so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "so_so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "uk":
            return `Привіт ${householdName}! У вас є продуктовий пакет для отримання ${pickupDate} о ${pickupTime} в ${locationName}, ${locationAddress}. Більше інформації: ${publicUrl}`;

        case "ru":
            return `Привет ${householdName}! У вас есть продуктовый пакет для получения ${pickupDate} в ${pickupTime} в ${locationName}, ${locationAddress}. Подробнее: ${publicUrl}`;

        case "ka":
            return `გამარჯობა ${householdName}! თქვენ გაქვთ საკვების პაკეტი აღებისთვის ${pickupDate}-ზე ${pickupTime} საათზე ${locationName}, ${locationAddress}. მეტი ინფორმაცია: ${publicUrl}`;

        case "fi":
            return `Hei ${householdName}! Sinulla on ruokapaketti noudettavana ${pickupDate} kello ${pickupTime} osoitteessa ${locationName}, ${locationAddress}. Lisätietoja: ${publicUrl}`;

        case "it":
            return `Ciao ${householdName}! Hai un pacco alimentare da ritirare il ${pickupDate} alle ${pickupTime} presso ${locationName}, ${locationAddress}. Maggiori informazioni: ${publicUrl}`;

        case "th":
            return `สวัสดี ${householdName}! คุณมีแพ็คเกจอาหารที่จะรับในวันที่ ${pickupDate} เวลา ${pickupTime} ที่ ${locationName}, ${locationAddress} ข้อมูลเพิ่มเติม: ${publicUrl}`;

        case "vi":
            return `Xin chào ${householdName}! Bạn có một gói thực phẩm để nhận vào ${pickupDate} lúc ${pickupTime} tại ${locationName}, ${locationAddress}. Thông tin thêm: ${publicUrl}`;

        case "pl":
            return `Cześć ${householdName}! Masz pakiet żywności do odbioru ${pickupDate} o ${pickupTime} w ${locationName}, ${locationAddress}. Więcej informacji: ${publicUrl}`;

        case "hy":
            return `Բարև ${householdName}! Դուք ունեք սննդային փաթեթ ${pickupDate}-ին ժամը ${pickupTime}-ին ${locationName}, ${locationAddress} հասցեում վերցնելու համար: Հավելյալ տեղեկություններ՝ ${publicUrl}`;

        default:
            // Fallback to English
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}
// TODO: Have pickup SMS templates in translation files
export function formatInitialPickupSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Hej ${householdName}! Du har ett matpaket att hämta ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `مرحبا ${householdName}! لديك طرد طعام للاستلام في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "fa":
            return `سلام ${householdName}! شما یک بسته غذا برای تحویل در ${pickupDate} در ${pickupTime} در ${locationName}، ${locationAddress} دارید. اطلاعات بیشتر: ${publicUrl}`;

        case "ku":
            return `Silav ${householdName}! Tu pakêteke xwarinê heye ku di ${pickupDate} de di ${pickupTime} de li ${locationName}, ${locationAddress} hilgirî. Agahdariya zêdetir: ${publicUrl}`;

        case "es":
            return `¡Hola ${householdName}! Tienes un paquete de comida para recoger el ${pickupDate} a las ${pickupTime} en ${locationName}, ${locationAddress}. Más información: ${publicUrl}`;

        case "fr":
            return `Bonjour ${householdName}! Vous avez un colis alimentaire à récupérer le ${pickupDate} à ${pickupTime} à ${locationName}, ${locationAddress}. Plus d'infos: ${publicUrl}`;

        case "de":
            return `Hallo ${householdName}! Sie haben ein Lebensmittelpaket am ${pickupDate} um ${pickupTime} bei ${locationName}, ${locationAddress} abzuholen. Mehr Infos: ${publicUrl}`;

        case "el":
            return `Γεια σας ${householdName}! Έχετε ένα πακέτο φαγητού να παραλάβετε στις ${pickupDate} στις ${pickupTime} στο ${locationName}, ${locationAddress}. Περισσότερες πληροφορίες: ${publicUrl}`;

        case "sw":
            return `Hujambo ${householdName}! Una kifurushi cha chakula cha kuchukua tarehe ${pickupDate} saa ${pickupTime} huko ${locationName}, ${locationAddress}. Maelezo zaidi: ${publicUrl}`;

        case "so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "so_so":
            return `Haye ${householdName}! Waxaad leedahay xirmo cunto ah oo aad ka qaadan karto ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "uk":
            return `Привіт ${householdName}! У вас є продуктовий пакет для отримання ${pickupDate} о ${pickupTime} в ${locationName}, ${locationAddress}. Більше інформації: ${publicUrl}`;

        case "ru":
            return `Привет ${householdName}! У вас есть продуктовый пакет для получения ${pickupDate} в ${pickupTime} в ${locationName}, ${locationAddress}. Подробнее: ${publicUrl}`;

        case "ka":
            return `გამარჯობა ${householdName}! თქვენ გაქვთ საკვების პაკეტი აღებისთვის ${pickupDate}-ზე ${pickupTime} საათზე ${locationName}, ${locationAddress}. მეტი ინფორმაცია: ${publicUrl}`;

        case "fi":
            return `Hei ${householdName}! Sinulla on ruokapaketti noudettavana ${pickupDate} kello ${pickupTime} osoitteessa ${locationName}, ${locationAddress}. Lisätietoja: ${publicUrl}`;

        case "it":
            return `Ciao ${householdName}! Hai un pacco alimentare da ritirare il ${pickupDate} alle ${pickupTime} presso ${locationName}, ${locationAddress}. Maggiori informazioni: ${publicUrl}`;

        case "th":
            return `สวัสดี ${householdName}! คุณมีแพ็คเกจอาหารที่จะรับในวันที่ ${pickupDate} เวลา ${pickupTime} ที่ ${locationName}, ${locationAddress} ข้อมูลเพิ่มเติม: ${publicUrl}`;

        case "vi":
            return `Xin chào ${householdName}! Bạn có một gói thực phẩm để nhận vào ${pickupDate} lúc ${pickupTime} tại ${locationName}, ${locationAddress}. Thông tin thêm: ${publicUrl}`;

        case "pl":
            return `Cześć ${householdName}! Masz pakiet żywności do odbioru ${pickupDate} o ${pickupTime} w ${locationName}, ${locationAddress}. Więcej informacji: ${publicUrl}`;

        case "hy":
            return `Բարև ${householdName}! Դուք ունեք սննդային փաթեթ ${pickupDate}-ին ժամը ${pickupTime}-ին ${locationName}, ${locationAddress} հասցեում վերցնելու համար: Հավելյալ տեղեկություններ՝ ${publicUrl}`;

        default:
            // Fallback to English
            return `Hello ${householdName}! You have a food parcel to pick up on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}

export function formatReminderPickupSms(data: SmsTemplateData, locale: string): string {
    const { householdName, pickupDate, pickupTime, locationName, locationAddress, publicUrl } =
        data;

    switch (locale) {
        case "sv":
            return `Påminnelse! Hej ${householdName}! Glöm inte att hämta ditt matpaket ${pickupDate} kl ${pickupTime} på ${locationName}, ${locationAddress}. Mer info: ${publicUrl}`;

        case "en":
            return `Reminder! Hello ${householdName}! Don't forget to pick up your food parcel on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;

        case "ar":
            return `تذكير! مرحبا ${householdName}! لا تنس استلام طرد الطعام الخاص بك في ${pickupDate} في ${pickupTime} في ${locationName}، ${locationAddress}. مزيد من المعلومات: ${publicUrl}`;

        case "fa":
            return `یادآوری! سلام ${householdName}! فراموش نکنید بسته غذایی خود را در ${pickupDate} در ${pickupTime} از ${locationName}، ${locationAddress} تحویل بگیرید. اطلاعات بیشتر: ${publicUrl}`;

        case "ku":
            return `Bîranîn! Silav ${householdName}! Ji bîr neke ku pakêta xwarinê ya xwe di ${pickupDate} de di ${pickupTime} de li ${locationName}, ${locationAddress} hilgirî. Agahdariya zêdetir: ${publicUrl}`;

        case "es":
            return `¡Recordatorio! ¡Hola ${householdName}! No olvides recoger tu paquete de comida el ${pickupDate} a las ${pickupTime} en ${locationName}, ${locationAddress}. Más información: ${publicUrl}`;

        case "fr":
            return `Rappel! Bonjour ${householdName}! N'oubliez pas de récupérer votre colis alimentaire le ${pickupDate} à ${pickupTime} à ${locationName}, ${locationAddress}. Plus d'infos: ${publicUrl}`;

        case "de":
            return `Erinnerung! Hallo ${householdName}! Vergessen Sie nicht, Ihr Lebensmittelpaket am ${pickupDate} um ${pickupTime} bei ${locationName}, ${locationAddress} abzuholen. Mehr Infos: ${publicUrl}`;

        case "el":
            return `Υπενθύμιση! Γεια σας ${householdName}! Μην ξεχάσετε να παραλάβετε το πακέτο φαγητού σας στις ${pickupDate} στις ${pickupTime} στο ${locationName}, ${locationAddress}. Περισσότερες πληροφορίες: ${publicUrl}`;

        case "sw":
            return `Ukumbusho! Hujambo ${householdName}! Usisahau kuchukua kifurushi chako cha chakula tarehe ${pickupDate} saa ${pickupTime} huko ${locationName}, ${locationAddress}. Maelezo zaidi: ${publicUrl}`;

        case "so":
            return `Xusuusin! Haye ${householdName}! Ha ilaawin inaad ka qaadatid xirmada cuntada ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "so_so":
            return `Xusuusin! Haye ${householdName}! Ha ilaawin inaad ka qaadatid xirmada cuntada ${pickupDate} saacadda ${pickupTime} ee ${locationName}, ${locationAddress}. Macluumaad dheeraad ah: ${publicUrl}`;

        case "uk":
            return `Нагадування! Привіт ${householdName}! Не забудьте отримати ваш продуктовий пакет ${pickupDate} о ${pickupTime} в ${locationName}, ${locationAddress}. Більше інформації: ${publicUrl}`;

        case "ru":
            return `Напоминание! Привет ${householdName}! Не забудьте получить ваш продуктовый пакет ${pickupDate} в ${pickupTime} в ${locationName}, ${locationAddress}. Подробнее: ${publicUrl}`;

        case "ka":
            return `შეხსენება! გამარჯობა ${householdName}! არ დაივიწყოთ თქვენი საკვების პაკეტის აღება ${pickupDate}-ზე ${pickupTime} საათზე ${locationName}, ${locationAddress}. მეტი ინფორმაცია: ${publicUrl}`;

        case "fi":
            return `Muistutus! Hei ${householdName}! Älä unohda noutaa ruokapakettisi ${pickupDate} kello ${pickupTime} osoitteessa ${locationName}, ${locationAddress}. Lisätietoja: ${publicUrl}`;

        case "it":
            return `Promemoria! Ciao ${householdName}! Non dimenticare di ritirare il tuo pacco alimentare il ${pickupDate} alle ${pickupTime} presso ${locationName}, ${locationAddress}. Maggiori informazioni: ${publicUrl}`;

        case "th":
            return `การแจ้งเตือน! สวัสดี ${householdName}! อย่าลืมมารับแพ็คเกจอาหารของคุณในวันที่ ${pickupDate} เวลา ${pickupTime} ที่ ${locationName}, ${locationAddress} ข้อมูลเพิ่มเติม: ${publicUrl}`;

        case "vi":
            return `Nhắc nhở! Xin chào ${householdName}! Đừng quên nhận gói thực phẩm của bạn vào ${pickupDate} lúc ${pickupTime} tại ${locationName}, ${locationAddress}. Thông tin thêm: ${publicUrl}`;

        case "pl":
            return `Przypomnienie! Cześć ${householdName}! Nie zapomnij odebrać swojego pakietu żywności ${pickupDate} o ${pickupTime} w ${locationName}, ${locationAddress}. Więcej informacji: ${publicUrl}`;

        case "hy":
            return `Հիշեցում! Բարև ${householdName}! Չմոռանաք վերցնել ձեր սննդային փաթեթը ${pickupDate}-ին ժամը ${pickupTime}-ին ${locationName}, ${locationAddress} հասցեում: Հավելյալ տեղեկություններ՝ ${publicUrl}`;

        default:
            // Fallback to English
            return `Reminder! Hello ${householdName}! Don't forget to pick up your food parcel on ${pickupDate} at ${pickupTime} at ${locationName}, ${locationAddress}. More info: ${publicUrl}`;
    }
}

// Format date and time for SMS according to locale
export function formatDateTimeForSms(date: Date, locale: string): { date: string; time: string } {
    // Convert to Stockholm time (Europe/Stockholm)
    const stockholmDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));

    switch (locale) {
        case "sv":
            return {
                date: stockholmDate.toLocaleDateString("sv-SE", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("sv-SE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "ar":
            return {
                date: stockholmDate.toLocaleDateString("ar-SA", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "fa":
            return {
                date: stockholmDate.toLocaleDateString("fa-IR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("fa-IR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "ku":
            // Kurdish uses similar format to English
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "es":
            return {
                date: stockholmDate.toLocaleDateString("es-ES", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "fr":
            return {
                date: stockholmDate.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "de":
            return {
                date: stockholmDate.toLocaleDateString("de-DE", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "el":
            return {
                date: stockholmDate.toLocaleDateString("el-GR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("el-GR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "sw":
            // Swahili uses similar format to English
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "so":
        case "so_so":
            // Somali uses a similar format to English
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "uk":
            return {
                date: stockholmDate.toLocaleDateString("uk-UA", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("uk-UA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "ru":
            return {
                date: stockholmDate.toLocaleDateString("ru-RU", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "ka":
            return {
                date: stockholmDate.toLocaleDateString("ka-GE", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("ka-GE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "fi":
            return {
                date: stockholmDate.toLocaleDateString("fi-FI", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("fi-FI", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "it":
            return {
                date: stockholmDate.toLocaleDateString("it-IT", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "th":
            return {
                date: stockholmDate.toLocaleDateString("th-TH", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "vi":
            return {
                date: stockholmDate.toLocaleDateString("vi-VN", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "pl":
            return {
                date: stockholmDate.toLocaleDateString("pl-PL", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("pl-PL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        case "hy":
            return {
                date: stockholmDate.toLocaleDateString("hy-AM", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("hy-AM", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };

        default:
            return {
                date: stockholmDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                time: stockholmDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            };
    }
}

export interface DevelopmentSeedProject {
  slug: string;
  name: string;
  address?: string;
  district?: string;
  constructionStatus: "PLANNED" | "UNDER_CONSTRUCTION" | "COMPLETED" | "PAUSED";
  salesStatus: "EXPECTED" | "LAUNCH" | "OPEN" | "CLOSED";
  sourceUrl: string;
}

export interface DevelopmentSeedDeveloper {
  slug: string;
  name: string;
  description: string;
  website: string;
  phone?: string;
  email?: string;
  projects: DevelopmentSeedProject[];
}

const project = (slug: string, name: string, constructionStatus: DevelopmentSeedProject["constructionStatus"], salesStatus: DevelopmentSeedProject["salesStatus"], sourceUrl: string, address?: string, district?: string): DevelopmentSeedProject => ({ slug, name, constructionStatus, salesStatus, sourceUrl, address, district });

export const developmentCatalogSeed: DevelopmentSeedDeveloper[] = [
  {
    slug: "kadorr-group", name: "KADORR Group", website: "https://estate.kadorrgroup.com/ru", phone: "+38 (048) 706 93 93",
    description: "Одесская девелоперская группа полного цикла, известная серией жилых комплексов «Жемчужина» и кварталом KADORR City.",
    projects: [
      project("kadorr-city", "KADORR City", "COMPLETED", "OPEN", "https://estate.kadorrgroup.com/ru/quarters/kadorr-city", "ул. Краснова", "Хаджибейский"),
      project("65-pearl", "65 Жемчужина", "COMPLETED", "OPEN", "https://estate.kadorrgroup.com/ru"),
      project("66-pearl", "66 Жемчужина", "UNDER_CONSTRUCTION", "OPEN", "https://estate.kadorrgroup.com/ru"),
      project("67-pearl", "67 Жемчужина", "UNDER_CONSTRUCTION", "OPEN", "https://estate.kadorrgroup.com/ru"),
      project("68-pearl", "68 Жемчужина", "UNDER_CONSTRUCTION", "OPEN", "https://estate.kadorrgroup.com/ru"),
      project("70-pearl", "70 Жемчужина", "PLANNED", "EXPECTED", "https://estate.kadorrgroup.com/ru"),
    ],
  },
  {
    slug: "gefest", name: "Гефест", website: "https://gefest.ua/ru", phone: "+38 (048) 752 93 51", email: "office@gefest-group.com",
    description: "Строительная компания из Одессы, работающая с 1997 года. Специализируется на жилых комплексах и коммерческой недвижимости преимущественно в Приморском районе.",
    projects: [
      project("ellada", "ЖК «Эллада»", "UNDER_CONSTRUCTION", "LAUNCH", "https://gefest.ua/ru", "ул. Генуэзская, 1-Ж", "Приморский"),
      project("ithaca", "Апарт-комплекс «Итака»", "UNDER_CONSTRUCTION", "OPEN", "https://gefest.ua/ru", "ул. Чубаевская, 1", "Приморский"),
      project("poseidon", "ЖК «Посейдон»", "UNDER_CONSTRUCTION", "OPEN", "https://gefest.ua/ru", "Дача Ковалевского, 5", "Киевский"),
      project("kimolos", "ЖК «Кимолос»", "COMPLETED", "OPEN", "https://gefest.ua/ru", "ул. Балтиморская, 20-А", "Приморский"),
      project("acropolis", "ЖК «Акрополь»", "COMPLETED", "CLOSED", "https://gefest.ua/ru", "Фонтанская дорога, 25", "Приморский"),
      project("apollo-quarantine", "Аполлон на Карантинной", "COMPLETED", "CLOSED", "https://gefest.ua/ru", "ул. Карантинная, 12", "Приморский"),
      project("milos", "ЖК «Милос»", "COMPLETED", "CLOSED", "https://gefest.ua/ru", "Клубничный переулок, 24", "Приморский"),
      project("korfu", "ЖК «Корфу»", "COMPLETED", "CLOSED", "https://gefest.ua/ru", "Кордонный переулок, 2/2", "Приморский"),
    ],
  },
  {
    slug: "prostranstvo", name: "Пространство Девелопмент", website: "https://prostranstvo.od.ua/objects", phone: "+380 67 487 39 55", email: "prostranstvoinf1@gmail.com",
    description: "Одесский девелопер жилых и многофункциональных проектов в центре, на Фонтане, у моря, на Таирова и Черёмушках.",
    projects: [
      project("rishelyevskaya", "Пространство на Ришельевской", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", "ул. Ришельевская", "Приморский"),
      project("stambulsky", "Пространство у Стамбульского", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", undefined, "Приморский"),
      project("inglesi", "Пространство на Инглези", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", "ул. Инглези", "Киевский"),
      project("tulskaya", "Пространство на Тульской", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", "ул. Тульская", "Киевский"),
      project("literaturnaya", "Пространство на Литературной", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", "ул. Литературная", "Приморский"),
      project("pedagogicheskaya", "Пространство на Педагогической", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", "ул. Педагогическая", "Приморский"),
      project("morskoy", "Пространство на Морском", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects"),
      project("archotel-avenue", "ARCHOTEL AVENUE", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", undefined, "Приморский"),
      project("itown", "ITown", "UNDER_CONSTRUCTION", "OPEN", "https://prostranstvo.od.ua/objects", undefined, "Приморский"),
    ],
  },
  {
    slug: "akvarel", name: "Акварель", website: "https://www.akvareli.od.ua/", phone: "0 800 20 46 46",
    description: "Группа компаний, развивающая жилые проекты «Акварель» в нескольких районах Одессы, а также коммерческие объекты.",
    projects: [
      project("akvarel-10", "ЖК «Акварель» 10", "UNDER_CONSTRUCTION", "OPEN", "https://www.akvareli.od.ua/", "ул. Академика Сахарова / Генерала Бочарова", "Пересыпский"),
      project("akvarel-9", "ЖК «Акварель» 9", "PLANNED", "EXPECTED", "https://www.akvareli.od.ua/", "проспект Небесной Сотни", "Киевский"),
      project("akvarel-7", "ЖК «Акварель» 7", "UNDER_CONSTRUCTION", "LAUNCH", "https://www.akvareli.od.ua/", "ул. Слободская, 56", "Пересыпский"),
      project("akvarel-3", "ЖК «Акварель» 3", "UNDER_CONSTRUCTION", "OPEN", "https://www.akvareli.od.ua/", "ул. Пишоновская", "Приморский"),
      project("akvarel-8", "ЖК «Акварель» 8", "COMPLETED", "OPEN", "https://www.akvareli.od.ua/", "ул. Дмитрия Вишневецкого, 93/4", "Киевский"),
      project("akvarel-4", "ЖК «Акварель» 4", "COMPLETED", "OPEN", "https://www.akvareli.od.ua/", "ул. Профсоюзная, 9А", "Хаджибейский"),
      project("akvarel-2", "ЖК «Акварель» 2", "COMPLETED", "OPEN", "https://www.akvareli.od.ua/", "ул. Жемчужная, 11", "Киевский"),
    ],
  },
  {
    slug: "two-academics", name: "Два Академика", website: "https://2aka.com.ua/", phone: "+380 67 522 07 52",
    description: "Одесская девелоперская компания с портфелем жилых домов, загородных форматов и проектов у моря.",
    projects: [
      project("garden-city", "Garden City", "UNDER_CONSTRUCTION", "OPEN", "https://2aka.com.ua/catalog/"),
      project("cuvee-village", "Cuvee Village", "UNDER_CONSTRUCTION", "OPEN", "https://2aka.com.ua/catalog/"),
      project("two-academics-house", "Дом «Два Академика»", "COMPLETED", "CLOSED", "https://2aka.com.ua/catalog/", "ул. Евгения Чикаленко, 43", "Киевский"),
      project("sea-view", "Sea View", "COMPLETED", "OPEN", "https://2aka.com.ua/catalog/"),
      project("east", "Дом «Схід»", "COMPLETED", "CLOSED", "https://2aka.com.ua/catalog/"),
      project("consul", "Дом «Консул»", "COMPLETED", "OPEN", "https://2aka.com.ua/catalog/", "Фонтанская дорога, 62К", "Приморский"),
    ],
  },
  {
    slug: "heritage", name: "Heritage", website: "https://heritagegroup.com.ua/", phone: "+380 67 799 89 79", email: "heritagegroup.ua@gmail.com",
    description: "Одесский девелопер камерных проектов бизнес- и премиум-класса, работающий также с реставрацией исторических зданий.",
    projects: [
      project("soho", "Квартал SOHO", "UNDER_CONSTRUCTION", "OPEN", "https://sohohouse.od.ua/", "ул. Александра Станкова, 15А", "Приморский"),
      project("gymnazist", "Клубный дом «Гимназист»", "COMPLETED", "OPEN", "https://heritagegroup.com.ua/", "ул. Гимназическая, 13", "Приморский"),
      project("ventimiglia", "Ventimiglia", "COMPLETED", "CLOSED", "https://heritagegroup.com.ua/"),
    ],
  },
  {
    slug: "platinumbud", name: "Платинумбуд", website: "https://www.odesa-city.com/", email: "odesa@city.com",
    description: "Девелопер жилого квартала ODESA CITY — проекта формата «город в городе» на Слободке.",
    projects: [project("odesa-city", "ODESA CITY", "UNDER_CONSTRUCTION", "LAUNCH", "https://www.odesa-city.com/", "ул. Грушевского, 49", "Хаджибейский")],
  },
  {
    slug: "stikon", name: "СТИКОН", website: "https://www.stikon.od.ua/", phone: "+38 (048) 775 9 775", email: "office@stikon.od.ua",
    description: "Одна из старейших строительных компаний Одессы с собственной производственной базой и жилыми проектами в разных районах города.",
    projects: [
      project("real-park", "ЖК Real Park", "UNDER_CONSTRUCTION", "OPEN", "https://www.stikon.od.ua/ua/objekti", undefined, "Хаджибейский"),
      project("modern", "ЖК Modern", "UNDER_CONSTRUCTION", "OPEN", "https://www.stikon.od.ua/ua/objekti", "Люстдорфская дорога, 55/6", "Киевский"),
      project("prokhorovsky", "Прохоровский квартал", "UNDER_CONSTRUCTION", "OPEN", "https://www.stikon.od.ua/ua/objekti", undefined, "Хаджибейский"),
      project("dmitrievsky", "ЖК Дмитриевский", "COMPLETED", "OPEN", "https://www.stikon.od.ua/ua/objekti"),
      project("gagarinsky", "ЖК Гагаринский", "COMPLETED", "CLOSED", "https://www.stikon.od.ua/ua/objekti", "Гагаринское плато, 9", "Приморский"),
    ],
  },
  {
    slug: "danlin", name: "Данлин", website: "https://tradicii.od.ua/ru/builder", phone: "+38 (048) 777 77 70", email: "info@tradicii.od.ua",
    description: "Одесский застройщик масштабных жилых кварталов, работающий с 2009 года; развивает проекты бренда «Одесские традиции».",
    projects: [
      project("odesa-traditions-slobodka", "Одеські традиції на Слободке", "COMPLETED", "OPEN", "https://www.tradicii.od.ua/", "ул. Академика Воробьёва", "Хаджибейский"),
      project("odesa-traditions-glushko", "Одеські традиції на Глушко", "COMPLETED", "OPEN", "https://tradicii.od.ua/ru/builder", "проспект Академика Глушко", "Киевский"),
      project("odesa-traditions-starosinna", "Одеські традиції на Старосенной", "UNDER_CONSTRUCTION", "OPEN", "https://starosinna.odesskie-tradicii.com/proekt", "Старосенная площадь", "Приморский"),
      project("seventh-sky", "ЖМ «Седьмое небо»", "UNDER_CONSTRUCTION", "OPEN", "https://tradicii.od.ua/ru/builder"),
    ],
  },
  {
    slug: "riviera-development", name: "Riviera Development", website: "https://riviera-d.com/uk/ua/", email: "office@blacksea-riviera.com",
    description: "Девелопер проектов у моря в Одессе и пригороде, включая масштабный «Авторский район» и квартальные жилые форматы.",
    projects: [
      project("authors-district", "Авторский район", "UNDER_CONSTRUCTION", "OPEN", "https://riviera-d.com/uk/ua/"),
      project("authors-quarter", "Жилой квартал «Авторский»", "COMPLETED", "OPEN", "https://riviera-d.com/uk/ua/"),
      project("unity-towers", "Unity Towers", "UNDER_CONSTRUCTION", "OPEN", "https://riviera-d.com/uk/ua/"),
      project("black-sea-riviera", "Черноморская Ривьера — город у моря", "UNDER_CONSTRUCTION", "OPEN", "https://riviera-d.com/uk/ua/"),
      project("villa-rose", "Таунхаусы Villa Rose", "COMPLETED", "OPEN", "https://riviera-d.com/uk/ua/"),
    ],
  },
];

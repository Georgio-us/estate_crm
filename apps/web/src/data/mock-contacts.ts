import type { Contact } from "@/types/crm";

const contactsWithoutRelations: Array<Omit<Contact, "relatedContacts">> = [
  { id: "contact-1", name: "Анна Коваленко", phone: "+38 093 412 68 20", telegram: "@anna_koval", source: "Meta", assignee: "Не назначен", dealIds: ["deal-1"], lastContact: "Сегодня, 10:43", nextTask: "Связаться сегодня", comment: "Предпочитает общение в Telegram.", createdAt: "Сегодня, 10:42" },
  { id: "contact-2", name: "Максим Бондарь", phone: "+38 067 801 15 44", source: "Meta", assignee: "Не назначен", dealIds: ["deal-2"], lastContact: "Сегодня, 09:18", createdAt: "Сегодня, 09:18" },
  { id: "contact-3", name: "Ольга Мельник", phone: "+38 097 503 45 03", email: "olga.melnik@example.com", telegram: "@olga_melnik", source: "Website", assignee: "Елена", dealIds: ["deal-3"], lastContact: "Вчера, 18:34", nextTask: "Позвонить до 14:00", comment: "Интересуется рассрочкой и готовыми новостройками.", createdAt: "Вчера, 18:34" },
  { id: "contact-4", name: "Алексей Романенко", phone: "+38 050 220 17 19", telegram: "@alex_roman", source: "Meta", assignee: "Георгий", dealIds: ["deal-4"], lastContact: "Сегодня, 12:10", nextTask: "Повторный звонок завтра", createdAt: "3 сентября, 15:10" },
  { id: "contact-5", name: "Ирина Савчук", phone: "+38 063 781 02 26", source: "Manual", assignee: "Елена", dealIds: ["deal-5"], lastContact: "2 сентября, 11:25", createdAt: "2 сентября, 11:25" },
  { id: "contact-6", name: "Сергей Литвин", phone: "+38 073 554 31 08", email: "sergey.litvin@example.com", source: "Meta", assignee: "Георгий", dealIds: ["deal-6"], lastContact: "Сегодня, 09:40", nextTask: "Подготовить подборку", createdAt: "28 августа, 16:03" },
  { id: "contact-7", name: "Виктория Гринь", phone: "+38 098 100 42 67", telegram: "@victoria_green", source: "Website", assignee: "Андрей", dealIds: ["deal-7"], lastContact: "Сегодня, 13:05", nextTask: "Отправить 3 объекта", comment: "Рассматривает только квартиры с готовым ремонтом.", createdAt: "21 августа, 12:47" },
  { id: "contact-8", name: "Дмитрий Орлов", phone: "+38 099 610 28 55", telegram: "@d_orlov", source: "Manual", assignee: "Георгий", dealIds: [], lastContact: "30 августа, 16:20", comment: "Контакт добавлен после рекомендации. Запрос пока не сформирован.", createdAt: "30 августа, 16:20" },
];

export const mockContacts: Contact[] = contactsWithoutRelations.map((contact) => ({ ...contact, relatedContacts: [] }));

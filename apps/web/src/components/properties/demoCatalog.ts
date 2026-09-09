import type { PropertyListing } from "@/types/crm";

export interface ProjectUnit {
  id: string;
  name: string;
  status: "Доступен" | "Резерв" | "Продан";
  price: number;
  currency: "USD" | "EUR";
  rooms: number;
  bathrooms: number;
  area: number;
  terraceArea?: number;
  floor: number;
  orientation: string;
  updatedAt: string;
}

export interface PropertyProject {
  id: string;
  title: string;
  developer: string;
  city: string;
  district: string;
  address: string;
  status: "Строится" | "Сдан" | "Продажи завершены";
  completion: string;
  priceFrom: number;
  currency: "USD" | "EUR";
  imageUrl: string;
  description: string;
  units: ProjectUnit[];
}

export const demoProjects: PropertyProject[] = [
  {
    id: "demo-project-marina",
    title: "Marina Residence",
    developer: "Delmar Development",
    city: "Одесса",
    district: "Приморский",
    address: "Французский бульвар",
    status: "Строится",
    completion: "IV квартал 2027",
    priceFrom: 96_500,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85",
    description: "Современный жилой комплекс рядом с морем: закрытая территория, подземный паркинг и квартиры с просторными террасами.",
    units: [
      { id: "marina-4-18", name: "Корпус 1 · этаж 4 · №18", status: "Доступен", price: 96_500, currency: "USD", rooms: 1, bathrooms: 1, area: 48.2, terraceArea: 6.4, floor: 4, orientation: "Юго-восток", updatedAt: "Сегодня, 09:30" },
      { id: "marina-7-31", name: "Корпус 1 · этаж 7 · №31", status: "Доступен", price: 128_000, currency: "USD", rooms: 2, bathrooms: 1, area: 67.8, terraceArea: 9.1, floor: 7, orientation: "Море", updatedAt: "Сегодня, 09:30" },
      { id: "marina-10-46", name: "Корпус 2 · этаж 10 · №46", status: "Резерв", price: 174_500, currency: "USD", rooms: 3, bathrooms: 2, area: 92.5, terraceArea: 14.8, floor: 10, orientation: "Юг", updatedAt: "Вчера, 18:10" },
      { id: "marina-12-54", name: "Корпус 2 · этаж 12 · №54", status: "Доступен", price: 221_000, currency: "USD", rooms: 3, bathrooms: 2, area: 118.4, terraceArea: 23.2, floor: 12, orientation: "Море", updatedAt: "Вчера, 18:10" },
    ],
  },
  {
    id: "demo-project-botanica",
    title: "Botanica",
    developer: "City Space",
    city: "Одесса",
    district: "Киевский",
    address: "Люстдорфская дорога",
    status: "Строится",
    completion: "II квартал 2028",
    priceFrom: 63_800,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85",
    description: "Семейный квартал с благоустроенным двором, детскими площадками и собственной коммерческой инфраструктурой.",
    units: [
      { id: "botanica-3-12", name: "Секция A · этаж 3 · №12", status: "Доступен", price: 63_800, currency: "USD", rooms: 1, bathrooms: 1, area: 41.3, floor: 3, orientation: "Запад", updatedAt: "Сегодня, 08:45" },
      { id: "botanica-6-29", name: "Секция A · этаж 6 · №29", status: "Доступен", price: 87_200, currency: "USD", rooms: 2, bathrooms: 1, area: 59.6, terraceArea: 4.8, floor: 6, orientation: "Восток", updatedAt: "Сегодня, 08:45" },
      { id: "botanica-8-41", name: "Секция B · этаж 8 · №41", status: "Продан", price: 116_400, currency: "USD", rooms: 3, bathrooms: 2, area: 84.1, floor: 8, orientation: "Юг", updatedAt: "7 сентября" },
    ],
  },
  {
    id: "demo-project-promenade",
    title: "Promenade",
    developer: "Black Sea Group",
    city: "Одесса",
    district: "Приморский",
    address: "Курортный переулок",
    status: "Сдан",
    completion: "Дом введён в эксплуатацию",
    priceFrom: 142_000,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85",
    description: "Готовые квартиры в клубном доме с панорамными окнами, консьерж-сервисом и пешей доступностью к побережью.",
    units: [
      { id: "promenade-2-7", name: "Этаж 2 · квартира 7", status: "Резерв", price: 142_000, currency: "USD", rooms: 2, bathrooms: 1, area: 71.4, terraceArea: 8.2, floor: 2, orientation: "Восток", updatedAt: "8 сентября" },
      { id: "promenade-5-19", name: "Этаж 5 · квартира 19", status: "Доступен", price: 189_000, currency: "USD", rooms: 3, bathrooms: 2, area: 98.7, terraceArea: 11.6, floor: 5, orientation: "Море", updatedAt: "8 сентября" },
    ],
  },
];

export const demoSecondaryProperties: PropertyListing[] = [
  {
    id: "demo-secondary-1", code: "DEMO-101", title: "Квартира на Французском бульваре", address: "Французский бульвар, 22", district: "Приморский", category: "Квартира", market: "Вторичный", operation: "Продажа", status: "Доступен", price: 185_000, currency: "USD", rooms: "3", area: 94, floor: 8, totalFloors: 16, description: "Светлая квартира с видом на море, просторной кухней-гостиной и двумя спальнями.", imageUrl: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85", updatedAt: "сегодня, 10:15",
  },
  {
    id: "demo-secondary-2", code: "DEMO-102", title: "Дом у моря", address: "Дача Ковалевского", district: "Киевский", category: "Дом", market: "Вторичный", operation: "Продажа", status: "Доступен", price: 420_000, currency: "USD", rooms: "5", area: 238, totalFloors: 2, landArea: 6.5, description: "Современный дом с террасой, бассейном и озеленённым участком в закрытом кооперативе.", imageUrl: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=85", updatedAt: "вчера, 17:40",
  },
  {
    id: "demo-secondary-3", code: "DEMO-103", title: "Апартаменты в Аркадии", address: "Генуэзская, 3", district: "Приморский", category: "Квартира", market: "Вторичный", operation: "Аренда", status: "Доступен", price: 1_150, currency: "USD", rooms: "2", area: 68, floor: 14, totalFloors: 24, description: "Апартаменты с панорамой города, полной комплектацией и подземным паркингом.", imageUrl: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=85", updatedAt: "8 сентября, 12:20",
  },
];

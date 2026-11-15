import type { Category } from "./types";

/** Categorias principais do Mercado Livre Brasil (usadas se a lista da API não puder ser carregada). */
export const FALLBACK_ML_CATEGORIES: Category[] = [
  { id: "MLB1000", name: "Eletrônicos, Áudio e Vídeo" }, { id: "MLB1051", name: "Celulares e Telefones" },
  { id: "MLB1648", name: "Informática" }, { id: "MLB1574", name: "Casa, Móveis e Decoração" },
  { id: "MLB5726", name: "Eletrodomésticos" }, { id: "MLB1246", name: "Beleza e Cuidado Pessoal" },
  { id: "MLB1276", name: "Esportes e Fitness" }, { id: "MLB1430", name: "Calçados, Roupas e Bolsas" },
  { id: "MLB1132", name: "Brinquedos e Hobbies" }, { id: "MLB1384", name: "Bebês" },
  { id: "MLB1071", name: "Animais" }, { id: "MLB263532", name: "Ferramentas" },
  { id: "MLB1144", name: "Games" }, { id: "MLB5672", name: "Acessórios para Veículos" },
  { id: "MLB3937", name: "Joias e Relógios" }, { id: "MLB264586", name: "Saúde" },
];

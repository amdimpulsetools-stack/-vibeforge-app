// Departamentos y distritos de Perú
// Estructura: Departamento → Distritos principales

export const PERU_DEPARTAMENTOS: Record<string, string[]> = {
  Amazonas: [
    "Chachapoyas", "Bagua", "Bagua Grande", "Jumbilla", "Lamud",
    "Nieva", "Mendoza", "Luya", "San Nicolás", "Leimebamba",
  ],
  Áncash: [
    "Huaraz", "Chimbote", "Nuevo Chimbote", "Caraz", "Casma",
    "Huarmey", "Carhuaz", "Yungay", "Recuay", "Pomabamba",
  ],
  Apurímac: [
    "Abancay", "Andahuaylas", "Tamburco", "San Jerónimo", "Chalhuanca",
    "Chincheros", "Chuquibambilla", "Antabamba", "Cotabambas", "Grau",
  ],
  Arequipa: [
    "Arequipa", "Cerro Colorado", "Cayma", "Paucarpata", "José Luis Bustamante y Rivero",
    "Socabaya", "Hunter", "Mariano Melgar", "Miraflores", "Alto Selva Alegre",
    "Yanahuara", "Sachaca", "Tiabaya", "Jacobo Hunter", "Characato",
    "Mollendo", "Camaná", "Mejía", "La Joya", "Chivay",
  ],
  Ayacucho: [
    "Ayacucho", "San Juan Bautista", "Carmen Alto", "Jesús Nazareno",
    "Huanta", "San Miguel", "Puquio", "Coracora", "Vilcashuamán",
  ],
  Cajamarca: [
    "Cajamarca", "Jaén", "Chota", "Cutervo", "Celendín",
    "Bambamarca", "San Ignacio", "Cajabamba", "Hualgayoc", "Santa Cruz",
  ],
  Callao: [
    "Callao", "Bellavista", "Carmen de la Legua Reynoso", "La Perla",
    "La Punta", "Ventanilla", "Mi Perú",
  ],
  Cusco: [
    "Cusco", "San Sebastián", "San Jerónimo", "Santiago", "Wanchaq",
    "Saylla", "Poroy", "Ccorca", "Sicuani", "Quillabamba",
    "Urubamba", "Calca", "Pisac", "Ollantaytambo", "Anta",
  ],
  Huancavelica: [
    "Huancavelica", "Ascensión", "Acobambilla", "Lircay", "Pampas",
    "Churcampa", "Castrovirreyna", "Tayacaja", "Angaraes",
  ],
  Huánuco: [
    "Huánuco", "Amarilis", "Pillco Marca", "Tingo María", "La Unión",
    "Ambo", "Lauricocha", "Dos de Mayo", "Pachitea",
  ],
  Ica: [
    "Ica", "Chincha Alta", "Pisco", "Nazca", "Palpa",
    "Pueblo Nuevo", "Los Aquijes", "Subtanjalla", "San Juan Bautista",
    "Santiago", "Parcona",
  ],
  Junín: [
    "Huancayo", "El Tambo", "Chilca", "Tarma", "La Oroya",
    "Jauja", "Satipo", "Chanchamayo", "La Merced", "San Ramón",
    "Concepción", "Junín", "Chupaca",
  ],
  "La Libertad": [
    "Trujillo", "La Esperanza", "El Porvenir", "Víctor Larco Herrera",
    "Florencia de Mora", "Huanchaco", "Laredo", "Moche", "Salaverry",
    "Santiago de Cao", "Ascope", "Pacasmayo", "Chepén", "Otuzco",
    "Sánchez Carrión",
  ],
  Lambayeque: [
    "Chiclayo", "José Leonardo Ortiz", "La Victoria", "Lambayeque",
    "Ferreñafe", "Monsefú", "Pimentel", "Santa Rosa", "Eten",
    "Pomalca", "Tumán", "Reque", "Oyotún",
  ],
  Lima: [
    "Lima", "San Isidro", "Miraflores", "Surco", "San Borja",
    "La Molina", "Barranco", "Jesús María", "Lince", "Magdalena del Mar",
    "Pueblo Libre", "San Miguel", "Breña", "Rímac", "San Martín de Porres",
    "Los Olivos", "Independencia", "Comas", "Carabayllo", "Puente Piedra",
    "San Juan de Lurigancho", "San Juan de Miraflores", "Villa María del Triunfo",
    "Villa El Salvador", "Chorrillos", "Surquillo", "Ate", "Santa Anita",
    "El Agustino", "La Victoria", "San Luis", "Chaclacayo", "Lurigancho-Chosica",
    "Cieneguilla", "Pachacámac", "Lurín", "Punta Hermosa", "Punta Negra",
    "San Bartolo", "Santa María del Mar", "Pucusana", "Ancón",
    "Huaral", "Huacho", "Barranca", "Cañete", "San Vicente de Cañete",
  ],
  Loreto: [
    "Iquitos", "Punchana", "Belén", "San Juan Bautista", "Nauta",
    "Yurimaguas", "Requena", "Contamana", "Caballococha",
  ],
  "Madre de Dios": [
    "Puerto Maldonado", "Tambopata", "Inambari", "Laberinto",
    "Las Piedras", "Iberia", "Iñapari", "Mazuko",
  ],
  Moquegua: [
    "Moquegua", "Ilo", "Samegua", "Torata", "Carumas",
    "Omate", "Puquina",
  ],
  Pasco: [
    "Cerro de Pasco", "Chaupimarca", "Yanacancha", "Simón Bolívar",
    "Oxapampa", "Villa Rica", "Pozuzo", "Daniel Alcides Carrión",
  ],
  Piura: [
    "Piura", "Castilla", "Catacaos", "Veintiséis de Octubre", "Sullana",
    "Talara", "Paita", "Sechura", "Chulucanas", "Morropón",
    "Tambogrande", "La Unión", "Ayabaca", "Huancabamba",
  ],
  Puno: [
    "Puno", "Juliaca", "Ayaviri", "Ilave", "Azángaro",
    "Macusani", "Lampa", "Huancané", "Juli", "Desaguadero",
    "Santa Lucía", "Cabanillas",
  ],
  "San Martín": [
    "Moyobamba", "Tarapoto", "Morales", "La Banda de Shilcayo",
    "Rioja", "Lamas", "Juanjuí", "Tocache", "Bellavista",
    "Saposoa", "Picota",
  ],
  Tacna: [
    "Tacna", "Alto de la Alianza", "Ciudad Nueva", "Gregorio Albarracín",
    "Pocollay", "Calana", "Sama", "Inclán", "Candarave",
  ],
  Tumbes: [
    "Tumbes", "Corrales", "La Cruz", "San Jacinto",
    "Zarumilla", "Aguas Verdes", "Zorritos", "Contralmirante Villar",
  ],
  Ucayali: [
    "Pucallpa", "Callería", "Yarinacocha", "Manantay",
    "Campo Verde", "Nueva Requena", "Aguaytía", "Atalaya",
  ],
};

export const PERU_DEPARTAMENTO_LIST = Object.keys(PERU_DEPARTAMENTOS).sort();

// Lista de países del mundo (para extranjeros)
export const COUNTRIES = [
  "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda",
  "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica",
  "Belice", "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina",
  "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi",
  "Bután", "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar",
  "Chad", "Chile", "China", "Chipre", "Colombia", "Comoras",
  "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba",
  "Dinamarca", "Dominica", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos",
  "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia",
  "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón",
  "Gambia", "Georgia", "Ghana", "Granada", "Grecia", "Guatemala",
  "Guinea", "Guinea Ecuatorial", "Guinea-Bisáu", "Guyana", "Haití", "Honduras",
  "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda",
  "Islandia", "Israel", "Italia", "Jamaica", "Japón", "Jordania",
  "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos",
  "Lesoto", "Letonia", "Líbano", "Liberia", "Libia", "Liechtenstein",
  "Lituania", "Luxemburgo", "Macedonia del Norte", "Madagascar", "Malasia", "Malaui",
  "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania",
  "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro",
  "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger",
  "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán",
  "Palaos", "Palestina", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú",
  "Polonia", "Portugal", "Reino Unido", "República Centroafricana", "República Checa", "República del Congo",
  "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumania", "Rusia", "Samoa",
  "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe",
  "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria",
  "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur",
  "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán",
  "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán",
  "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán",
  "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue",
];

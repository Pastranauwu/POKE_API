# Pokedex Minimal (PokeAPI)

Interfaz minimalista, responsiva y accesible para explorar la PokeAPI.

## Características
- Lista infinita (scroll) de Pokémon con tarjetas.
- Búsqueda por nombre o ID.
- Filtro por tipo (Agua, Fuego, etc.).
- Detalle en modal: arte oficial, tipos, altura/peso y estadísticas.
- Modo oscuro/auto/claro con persistencia.
- Carga esquelética y cacheo básico en localStorage.
- Accesible (roles ARIA, navegación con teclado, focusable).

## Cómo usar
- Opción rápida: abre `pokedex.html` en tu navegador.
- Recomendado (servidor local): sirve la carpeta por HTTP para evitar restricciones del navegador.

## Solución de problemas
- Si la búsqueda no encuentra un Pokémon, asegúrate de usar el nombre en minúsculas o el ID (por ejemplo, `pikachu` o `25`).
- Si la lista no carga, revisa tu conexión a Internet y la disponibilidad de `https://pokeapi.co`.
- Limpia los filtros con el botón "Limpiar" para volver a la exploración.

## Créditos
- Datos: PokeAPI (https://pokeapi.co/)

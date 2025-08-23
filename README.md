# 🐉 Malla Curricular Interactiva

Un proyecto diseñado por un estudiante de la carrera de Ingeniería en Ciencias de la Computación de la Universidad San Francisco de Quito. Una malla interactiva para que puedas seguir tu progreso en la carrera de manera visual e intuitiva.

## 🎯 Descripción

Esta aplicación web permite a los estudiantes de la USFQ visualizar y gestionar su progreso académico de forma interactiva. Con una interfaz moderna y amigable, puedes marcar materias completadas, ver prerrequisitos, y planificar tu ruta académica semestre por semestre.

## ✨ Características

- **📊 Visualización Interactiva**: Malla curricular organizada por semestres
- **✅ Seguimiento de Progreso**: Marca materias completadas y ve tu avance
- **🔗 Prerrequisitos**: Visualiza las dependencias entre materias
- **🌙 Modo Oscuro**: Interfaz adaptable con tema claro/oscuro
- **📱 Responsive**: Funciona perfectamente en móviles y desktop
- **💾 Persistencia Local**: Tu progreso se guarda automáticamente
- **📈 Exportación**: Genera diagramas Mermaid de tu progreso
- **🎨 UI Moderna**: Diseño limpio con animaciones suaves

## 🚀 Demo en Vivo

Visita la aplicación: [https://pichuelectrico.github.io/malla-curricular-interactiva/](https://pichuelectrico.github.io/malla-curricular-interactiva/)

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Build Tool**: Vite 6
- **UI Components**: Radix UI
- **State Management**: React Query (TanStack Query)
- **Icons**: Lucide React
- **Deployment**: GitHub Pages + GitHub Actions

## 📦 Instalación Local

### Prerrequisitos
- Node.js 18+ 
- npm o yarn

### Pasos

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/Pichuelectrico/malla-curricular-interactiva.git
   cd malla-curricular-interactiva
   ```

2. **Instala las dependencias**
   ```bash
   cd frontend
   npm install
   ```

3. **Inicia el servidor de desarrollo**
   ```bash
   npm run dev
   ```

4. **Abre tu navegador**
   ```
   http://localhost:5173
   ```

## 🏗️ Estructura del Proyecto

```
frontend/
├── components/          # Componentes React
│   ├── ui/             # Componentes base (Radix UI)
│   ├── CurriculumGrid.tsx
│   ├── CourseCard.tsx
│   ├── ThemeToggle.tsx
│   ├── Footer.tsx
│   └── ...
├── data/               # Datos de la malla curricular
│   └── Malla-CMP.json
├── lib/                # Utilidades y helpers
├── utils/              # Funciones de utilidad
├── Img/                # Assets e imágenes
└── ...
```

## 📊 Datos de la Malla

Los datos de la malla curricular se encuentran en `frontend/data/Malla-CMP.json` y incluyen:

- **Código y nombre** de cada materia
- **Créditos** académicos
- **Semestre** recomendado
- **Prerrequisitos** necesarios
- **Materias alternativas**
- **Bloques** de organización

## 🎨 Personalización

### Agregar Nuevas Materias

Edita el archivo `frontend/data/Malla-CMP.json`:

```json
{
  "id": "NUEVA_MATERIA",
  "code": "ABC-123",
  "title": "Nueva Materia",
  "credits": 3,
  "semester": 1,
  "block": "Primer Semestre",
  "prerequisites": ["PREREQ_ID"],
  "alternatives": []
}
```

### Cambiar Tema

El tema se puede cambiar usando el botón en la esquina superior derecha, o modificando los colores en `frontend/index.css`.

## 🚀 Despliegue

El proyecto se despliega automáticamente en GitHub Pages usando GitHub Actions. Cada push a la rama `web` activa el workflow de despliegue.

### Despliegue Manual

```bash
npm run build
```

Los archivos generados estarán en `frontend/dist/`.

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si eres estudiante de la USFQ y quieres mejorar la aplicación:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📝 Roadmap

- [ ] Soporte para múltiples carreras
- [ ] Integración con sistema académico USFQ
- [ ] Calculadora de promedio ponderado
- [ ] Recomendaciones de materias por semestre
- [ ] Exportación a PDF

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 👨‍💻 Autor

**Joshua Reinoso** - Estudiante de Ingeniería en Ciencias de la Computación, USFQ

- 🔗 LinkedIn: [joshua-reinoso-cevallos](https://www.linkedin.com/in/joshua-reinoso-cevallos-0b9b85286/)
- 🐙 GitHub: [@Pichuelectrico](https://github.com/Pichuelectrico)

---

<div align="center">
  <p><strong>Made by a Dragon 🐉❤️</strong></p>
  <p><em>Universidad San Francisco de Quito - 2025</em></p>
</div>

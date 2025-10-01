import { Course } from "../types/curriculum";

export function generateMermaidDiagram(
  courses: Course[],
  completedCourses: Set<string>,
  sourceFile?: string
): string {
  const mermaidCode = ["flowchart TD"];

  // Add title
  const title = sourceFile || "Malla Curricular";
  mermaidCode.push(`    Title["${title}"]:::title`);
  mermaidCode.push("");

  // Group courses by semester for better organization
  const coursesBySemester = courses.reduce((acc, course) => {
    const semester = course.semester;
    if (!acc[semester]) {
      acc[semester] = [];
    }
    acc[semester].push(course);
    return acc;
  }, {} as Record<number, Course[]>);

  // Add semester subgraphs
  Object.keys(coursesBySemester)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .forEach((semester) => {
      const semesterCourses = coursesBySemester[parseInt(semester)];
      const semesterName = semesterCourses[0]?.block || `Semestre ${semester}`;

      mermaidCode.push(`    subgraph S${semester}["${semesterName}"]`);

      // Add nodes for this semester
      semesterCourses.forEach((course) => {
        const isCompleted = completedCourses.has(course.id);
        const nodeStyle = isCompleted ? ":::completed" : ":::pending";
        const nodeLabel = `${course.code}<br/>${course.title}<br/>${course.credits} cr`;
        mermaidCode.push(`        ${course.id}["${nodeLabel}"]${nodeStyle}`);
      });

      mermaidCode.push("    end");
      mermaidCode.push("");
    });

  // Add dependencies with proper arrow styling
  const linkStyles: string[] = [];
  let linkIndex = 0;
  const colors = [
    '#3b82f6', // blue-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
    '#06b6d4', // cyan-500
    '#a855f7'  // purple-500
  ];

  // First, add all the connections
  courses.forEach((course) => {
    // Prerequisites (solid arrows)
    course.prerequisites.forEach((prereqId) => {
      mermaidCode.push(`    ${prereqId} --> ${course.id}`);
      const color = colors[linkIndex % colors.length];
      linkStyles.push(`    linkStyle ${linkIndex} stroke:${color},stroke-width:2px`);
      linkIndex++;
    });

    // Alternatives (dotted arrows)
    course.alternatives.forEach((altId) => {
      mermaidCode.push(`    ${altId} -.-> ${course.id}`);
      const color = colors[linkIndex % colors.length];
      linkStyles.push(`    linkStyle ${linkIndex} stroke:${color},stroke-width:2px,stroke-dasharray:3`);
      linkIndex++;
    });
  });

  // Connect title to first semester courses
  const firstSemesterCourses = coursesBySemester[1] || [];
  firstSemesterCourses.forEach((course) => {
    if (course.prerequisites.length === 0) {
      mermaidCode.push(`    Title --> ${course.id}`);
    }
  });

  mermaidCode.push("");

  // Add styling with better flowchart appearance
  mermaidCode.push(
    "    classDef title fill:#1e40af,stroke:#1d4ed8,stroke-width:3px,color:#000,font-weight:bold,font-size:16px"
  );
  mermaidCode.push(
    "    classDef completed fill:#22c55e,stroke:#16a34a,stroke-width:2px,color:#000"
  );
  mermaidCode.push(
    "    classDef pending fill:#f8fafc,stroke:#64748b,stroke-width:2px,color:#334155"
  );

  // Style subgraphs
  mermaidCode.push(
    "    classDef default fill:#f1f5f9,stroke:#cbd5e1,stroke-width:1px"
  );
  
  // Add the custom link styles
  mermaidCode.push(...linkStyles);

  return mermaidCode.join("\n");
}

export async function downloadPDF(
  mermaidCode: string,
  filename: string
): Promise<void> {
  try {
    // Create a temporary HTML page with Mermaid
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: Arial, sans-serif;
            background: white;
        }
        .mermaid {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        @media print {
            body { margin: 0; padding: 10px; }
            .mermaid { min-height: auto; }
        }
    </style>
</head>
<body>
    <h1>Malla Curricular - Progreso</h1>
    <div class="mermaid">
${mermaidCode}
    </div>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis',
                padding: 20
            },
            themeVariables: {
                primaryColor: '#f8fafc',
                primaryTextColor: '#334155',
                primaryBorderColor: '#64748b',
                lineColor: '#475569',
                secondaryColor: '#e2e8f0',
                tertiaryColor: '#f1f5f9'
            }
        });
        
        // Wait for mermaid to render, then trigger print
        setTimeout(() => {
            window.print();
        }, 3000);
    </script>
</body>
</html>`;

    // Create a blob and download it
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Open in new window for printing/saving as PDF
    const printWindow = window.open(url, "_blank");

    if (printWindow) {
      printWindow.onload = () => {
        // Clean up the blob URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      // Fallback: download the HTML file
      const link = document.createElement("a");
      link.href = url;
      link.download = filename.replace(".pdf", ".html");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}

import { Course } from '../types/curriculum';

export function generateMermaidDiagram(courses: Course[], completedCourses: Set<string>): string {
  const mermaidCode = ['graph TD'];
  
  // Add nodes with styling
  courses.forEach(course => {
    const isCompleted = completedCourses.has(course.id);
    const nodeStyle = isCompleted ? ':::completed' : ':::pending';
    const nodeLabel = `${course.code}<br/>${course.title}<br/>${course.credits} cr`;
    mermaidCode.push(`    ${course.id}["${nodeLabel}"]${nodeStyle}`);
  });
  
  // Add dependencies
  courses.forEach(course => {
    course.prerequisites.forEach(prereqId => {
      mermaidCode.push(`    ${prereqId} --> ${course.id}`);
    });
    
    // Handle alternatives (OR relationships)
    if (course.alternatives.length > 0) {
      course.alternatives.forEach(altId => {
        mermaidCode.push(`    ${altId} -.-> ${course.id}`);
      });
    }
  });
  
  // Add styling
  mermaidCode.push('');
  mermaidCode.push('    classDef completed fill:#22c55e,stroke:#16a34a,stroke-width:2px,color:#fff');
  mermaidCode.push('    classDef pending fill:#f3f4f6,stroke:#9ca3af,stroke-width:1px,color:#374151');
  
  return mermaidCode.join('\n');
}

export async function downloadPDF(mermaidCode: string, filename: string): Promise<void> {
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
                htmlLabels: true
            }
        });
        
        // Wait for mermaid to render, then trigger print
        setTimeout(() => {
            window.print();
        }, 2000);
    </script>
</body>
</html>`;

    // Create a blob and download it
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in new window for printing/saving as PDF
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        // Clean up the blob URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      // Fallback: download the HTML file
      const link = document.createElement('a');
      link.href = url;
      link.download = filename.replace('.pdf', '.html');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

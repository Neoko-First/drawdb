import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getDiagramsFull } from "../api/diagrams";
import { getTemplates } from "../api/templates";

export async function exportSavedData() {
  const zip = new JSZip();

  const [diagrams, customTemplates] = await Promise.all([
    getDiagramsFull(),
    getTemplates(1),
  ]);

  const diagramsFolder = zip.folder("diagrams");
  for (const diagram of diagrams) {
    diagramsFolder.file(
      `${diagram.name}(${diagram.diagramId}).json`,
      JSON.stringify(diagram, null, 2),
    );
  }

  const templatesFolder = zip.folder("templates");
  for (const template of customTemplates) {
    templatesFolder.file(
      `${template.title}(${template.templateId}).json`,
      JSON.stringify(template, null, 2),
    );
  }

  const content = await zip.generateAsync({ type: "blob" });
  const date = new Date();
  saveAs(
    content,
    `${date.getFullYear()}_${date.getMonth()}_${date.getDay()}_export.zip`,
  );
}

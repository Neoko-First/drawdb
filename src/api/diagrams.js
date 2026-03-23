import axios from "axios";

const baseUrl = import.meta.env.VITE_BACKEND_URL;

export async function getDiagrams() {
  const { data } = await axios.get(`${baseUrl}/api/diagrams`);
  return data;
}

export async function getDiagramsFull() {
  const { data } = await axios.get(`${baseUrl}/api/diagrams?full=true`);
  return data;
}

export async function getLatestDiagram() {
  try {
    const { data } = await axios.get(`${baseUrl}/api/diagrams/latest`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function getDiagram(diagramId) {
  try {
    const { data } = await axios.get(`${baseUrl}/api/diagrams/${diagramId}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function getDiagramByGistId(gistId) {
  const { data } = await axios.get(
    `${baseUrl}/api/diagrams?loadedFromGistId=${encodeURIComponent(gistId)}`
  );
  return data; // null or { diagramId }
}

export async function createDiagram(diagramData) {
  const { data } = await axios.post(`${baseUrl}/api/diagrams`, diagramData);
  return data; // { diagramId }
}

export async function updateDiagram(diagramId, diagramData) {
  await axios.put(`${baseUrl}/api/diagrams/${diagramId}`, diagramData);
}

export async function deleteDiagram(diagramId) {
  await axios.delete(`${baseUrl}/api/diagrams/${diagramId}`);
}

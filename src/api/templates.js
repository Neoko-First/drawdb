import axios from "axios";

const baseUrl = import.meta.env.VITE_BACKEND_URL;

export async function getTemplates(custom) {
  const params = custom !== undefined ? `?custom=${custom}` : "";
  const { data } = await axios.get(`${baseUrl}/api/templates${params}`);
  return data;
}

export async function getTemplate(templateId) {
  try {
    const { data } = await axios.get(`${baseUrl}/api/templates/${templateId}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function createTemplate(templateData) {
  const { data } = await axios.post(`${baseUrl}/api/templates`, templateData);
  return data; // { templateId }
}

export async function deleteTemplate(templateId) {
  await axios.delete(`${baseUrl}/api/templates/${templateId}`);
}

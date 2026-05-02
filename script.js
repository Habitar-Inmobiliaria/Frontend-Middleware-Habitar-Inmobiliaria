const fs = require('fs');

const raw = fs.readFileSync('C:/Users/asus/.gemini/antigravity/brain/98757ab0-3897-41a3-b1dd-a8584cbf6f35/.system_generated/steps/505/output.txt', 'utf8');
const jsonStr = raw.substring(raw.indexOf('{"workflow"'));
const data = JSON.parse(jsonStr);

let nodes = data.workflow.nodes;
let connections = data.workflow.connections;

// 1. Modificar Extraer Datos
let extraerDatos = nodes.find(n => n.name === 'Extraer Datos');
extraerDatos.parameters.jsCode = extraerDatos.parameters.jsCode.replace(
  "if (webhookData.event !== 'message_created' && webhookData.event !== 'conversation_created') {",
  "// Permitir updates para capturar adjuntos o cambios de estado\\nif (!['message_created', 'message_updated', 'conversation_created', 'conversation_updated'].includes(webhookData.event)) {"
);

// 2. Modificar Extraer Metadata
let extraerMetadata = nodes.find(n => n.name === 'Extraer Metadata');
let metaCode = extraerMetadata.parameters.jsCode;
metaCode = metaCode.replace("let html_bubble = '';", 
`let msg_id = webhookData.id;
if (!msg_id && webhookData.messages && webhookData.messages.length > 0) {
    msg_id = webhookData.messages[0].id;
}
msg_id = msg_id || hs_timestamp; // Fallback

let bubble_wrapper_start = '<div id="cw-msg-' + msg_id + '" data-msg-id="' + msg_id + '">';
let bubble_wrapper_end = '</div><!-- end-cw-msg-' + msg_id + ' -->';

let html_bubble = bubble_wrapper_start;`);

metaCode = metaCode.replace(
  "html_bubble = '<div style=\"text-align: left; margin-bottom: 12px; margin-top: 4px;\">' +",
  "html_bubble += '<div style=\"text-align: left; margin-bottom: 12px; margin-top: 4px;\">' +"
);
metaCode = metaCode.replace(
  "html_bubble = '<div style=\"text-align: right; margin-bottom: 12px; margin-top: 4px;\">' +",
  "html_bubble += '<div style=\"text-align: right; margin-bottom: 12px; margin-top: 4px;\">' +"
);
metaCode = metaCode.replace(
  "const saved_chatwoot_id =",
  "html_bubble += bubble_wrapper_end;\\n\\nconst saved_chatwoot_id ="
);
metaCode = metaCode.replace("hs_timestamp,\\n      html_bubble", "hs_timestamp,\\n      html_bubble,\\n      msg_id");
extraerMetadata.parameters.jsCode = metaCode;

// 3. Crear nodo: Preparar Actualizacion HTML
let prepararHtmlNode = {
  "parameters": {
    "mode": "runOnceForEachItem",
    "jsCode": "const item = $input.item.json;\\nconst existing_html = item.properties?.hs_communication_body || \"\";\\nconst meta = $(\"Extraer Metadata\").item.json.mensaje_actual;\\nconst new_bubble = meta.html_bubble;\\nconst msg_id = meta.msg_id;\\n\\nlet updated_html = existing_html;\\nconst regex = new RegExp('<div id=\"cw-msg-' + msg_id + '\".*?<!-- end-cw-msg-' + msg_id + ' -->', 'gs');\\n\\nif (regex.test(existing_html)) {\\n    updated_html = existing_html.replace(regex, new_bubble);\\n} else {\\n    updated_html = existing_html + new_bubble;\\n}\\n\\nreturn { json: { ...item, updated_html } };"
  },
  "id": "e0e2d1d2-1234-4567-89ab-cdef01234567",
  "name": "Preparar Actualizacion HTML",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1408, 560]
};

// 4. Modificar Actualizar Comunicacion
let actualizarComunicacion = nodes.find(n => n.name === 'Actualizar Comunicacion');
actualizarComunicacion.position = [1600, 560];
actualizarComunicacion.parameters.jsonBody = '={{ { "properties": { "hs_communication_body": $json.updated_html } } }}';

// 5. Crear nodo: Crear Contacto
let crearContacto = {
  "parameters": {
    "method": "POST",
    "url": "https://api.hubapi.com/crm/v3/objects/contacts",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "hubspotAppToken",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ { \"properties\": $(\"Preparar Upsert\").item.json.upsert_properties } }}",
    "options": {}
  },
  "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
  "name": "Crear Contacto",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "position": [752, 624]
};

// 6. Crear nodo: Mapear Nuevo Contacto
let mapearNuevoContacto = {
  "parameters": {
    "mode": "runOnceForEachItem",
    "jsCode": "const item = $input.item.json;\\nconst chatwootData = $('Preparar Upsert').item.json;\\n\\nreturn {\\n  json: {\\n    ...chatwootData,\\n    encontrado: true,\\n    hubspot_contacto_id: String(item.id),\\n    hubspot_search_result: { properties: {} }\\n  }\\n};"
  },
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Mapear Nuevo Contacto",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [960, 624]
};


// Eliminar el "No Operation" y agregar los nuevos
nodes = nodes.filter(n => n.name !== 'No Operation, do nothing');
nodes.push(prepararHtmlNode);
nodes.push(crearContacto);
nodes.push(mapearNuevoContacto);

// Arreglar Conexiones
// ¿Existe Contacto? -> false -> Crear Contacto
connections['¿Existe Contacto?'].main[1] = [{ "node": "Crear Contacto", "type": "main", "index": 0 }];

// Crear Contacto -> Mapear Nuevo Contacto
connections['Crear Contacto'] = { main: [[{ "node": "Mapear Nuevo Contacto", "type": "main", "index": 0 }]] };

// Mapear Nuevo Contacto -> Extraer Metadata
connections['Mapear Nuevo Contacto'] = { main: [[{ "node": "Extraer Metadata", "type": "main", "index": 0 }]] };

// Traer Comunicacion Actual -> Preparar Actualizacion HTML
connections['Traer Comunicacion Actual'].main[0] = [{ "node": "Preparar Actualizacion HTML", "type": "main", "index": 0 }];

// Preparar Actualizacion HTML -> Actualizar Comunicacion
connections['Preparar Actualizacion HTML'] = { main: [[{ "node": "Actualizar Comunicacion", "type": "main", "index": 0 }]] };


data.workflow.nodes = nodes;
data.workflow.connections = connections;

fs.writeFileSync('C:/Users/asus/Frontend-middleware-service/flujo_corregido.json', JSON.stringify(data.workflow, null, 2));
console.log('Done');

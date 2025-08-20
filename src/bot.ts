import { Client, LocalAuth, Message, Chat, Contact, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

// ---------- ESTADOS ----------
type ChatMode =
  | 'normal'
  | 'aguardando_opcao'
  | 'aguardando_plano'
  | 'confirma_iniciante'
  | 'confirma_lutador'
  | 'confirma_campeao'
  | 'confirma_gpass';

const chatState: Map<string, ChatMode> = new Map();
// Guarda o último dia (AAAA-MM-DD) em que já enviamos o menu para cada chat
const lastMenuDayByChat: Map<string, string> = new Map();

// ---------- CLIENT ----------
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-accelerated-2d-canvas',
  '--no-zygote',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  // '--single-process', // se ficar instável, mantenha comentado
];

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: PUPPETEER_ARGS,
    // executablePath: '/usr/bin/google-chrome-stable'
  }
});

// ---------- HELPERS ----------
const delay = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));

const PAGAMENTOS =
  `*Pagamentos*:\n` +
  `Todos os pagamentos devem ser feitos para:\n` +
  `CNPJ: 58.656.721/0001-34\n` +
  `Titular: João Pedro Alves Santana (Banco Sicred)\n\n` +
  `Se quiser ver as opções novamente é só digitar "menu"😉`;

const isAffirmative = (t: string) =>
  /\b(sim|s|quero|claro|ok|blz|beleza|bora|vamos|perfeito|top|quero sim|yes|yep)\b/i.test(t);

const isNegative = (t: string) =>
  /\b(n[ãa]o|nao|n|agora n[ãa]o|depois|prefiro n[ãa]o|negativo)\b/i.test(t);

function currentDateInTZ(tz: string = 'America/Sao_Paulo'): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`; // AAAA-MM-DD
}

// Cache do PDF para evitar I/O a cada envio
let HORARIOS_MEDIA: MessageMedia | null = null;
function ensureHorariosLoaded() {
  if (HORARIOS_MEDIA) return;
  const mediaPath = path.join(__dirname, '..', 'horarios.pdf');
  if (fs.existsSync(mediaPath)) {
    HORARIOS_MEDIA = MessageMedia.fromFilePath(mediaPath);
  }
}

async function sendHorarios(chat: Chat) {
  ensureHorariosLoaded();
  if (HORARIOS_MEDIA) {
    await chat.sendMessage(HORARIOS_MEDIA, { caption: '*Segue a planilha de horários em PDF:*' });
  } else {
    await chat.sendMessage('⚠️ Arquivo de horários não encontrado no servidor.');
  }
}

async function backToMenu(msg: Message) {
  const chat = await msg.getChat();
  await chat.sendMessage('Sem problema! Voltei para o menu pra você 👍');
  await sendMenu(msg);
  chatState.set(msg.from, 'aguardando_opcao');
}

// Helpers “seguros” para evitar exceções em ambientes onde typing/unread falham
async function tryTyping(chat: Chat) {
  try { await chat.sendStateTyping(); } catch { /* ignora erro */ }
}
async function tryMarkUnread(chat: Chat) {
  try { await chat.markUnread(); } catch { /* ignora erro */ }
}

// ---------- BOOT ----------
client.on('qr', (qr: string) => {
  console.log('QR recebido, escaneie para autenticar:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Robô pronto para funcionar');
  ensureHorariosLoaded();
});

// ---------- CORE: 1ª mensagem do dia manda o menu ----------
client.on('message', async (msg: Message) => {
  try {
    // Somente em chats privados
    if (!msg.from.endsWith('@c.us')) return;

    const chatId = msg.from;
    const text = (msg.body || '').trim();
    const lower = text.toLowerCase();
    const chat: Chat = await msg.getChat();

    // Inicializa estado explícito como "normal" se for a 1ª interação do chat
    if (!chatState.get(chatId)) {
      chatState.set(chatId, 'normal');
    }

    // 1) Envia o menu se for a primeira mensagem DO DIA (por chat)
    const today = currentDateInTZ('America/Sao_Paulo');
    const lastDay = lastMenuDayByChat.get(chatId);

    if (lastDay !== today) {
      await sendWelcomeMenu(msg);
      lastMenuDayByChat.set(chatId, today);

      // garante que, se estava "normal", já fica aguardando opção
      const estado = chatState.get(chatId) ?? 'normal';
      if (estado === 'normal') {
        chatState.set(chatId, 'aguardando_opcao');
      }
      return; // evita processar a mesma mensagem
    }

    // 2) Carrega o estado atual para seguir o fluxo
    let estadoAtual = chatState.get(chatId) ?? 'normal';

    // /menu a qualquer momento
    if (/^(menu)$/i.test(lower)) {
      await tryTyping(chat);
      await sendMenu(msg);
      chatState.set(chatId, 'aguardando_opcao');
      return;
    }

    // -------- CONFIRMAÇÕES POR PLANO --------
    if (estadoAtual === 'confirma_iniciante') {
      if (isAffirmative(lower)) {
        await tryTyping(chat);
        await chat.sendMessage(
          'Boa decisão! 🎯 A *aula experimental* é a melhor forma de sentir o ritmo e conhecer os professores. ' +
          'Dá pra ajustar a intensidade, tirar dúvidas e achar o melhor horário pra você.\n\nVou te mandar a planilha de horários:'
        );
        await sendHorarios(chat);
        await tryTyping(chat);
        await chat.sendMessage(PAGAMENTOS);
        await tryMarkUnread(chat);
        chatState.set(chatId, 'normal');
        return;
      }
      if (isNegative(lower)) {
        await tryMarkUnread(chat);
        await backToMenu(msg);
        return;
      }
      await chat.sendMessage('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_lutador') {
      if (isAffirmative(lower)) {
        await sendHorarios(chat);
        await tryTyping(chat);
        await chat.sendMessage(PAGAMENTOS);
        await tryMarkUnread(chat);
        chatState.set(chatId, 'normal');
        return;
      }
      if (isNegative(lower)) {
        await tryMarkUnread(chat);
        await backToMenu(msg);
        return;
      }
      await chat.sendMessage('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_campeao') {
      if (isAffirmative(lower)) {
        await sendHorarios(chat);
        await tryTyping(chat);
        await chat.sendMessage(PAGAMENTOS);
        await tryMarkUnread(chat);
        chatState.set(chatId, 'normal');
        return;
      }
      if (isNegative(lower)) {
        await tryMarkUnread(chat);
        await backToMenu(msg);
        return;
      }
      await chat.sendMessage('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_gpass') {
      if (isAffirmative(lower)) {
        await tryTyping(chat);
        await chat.sendMessage('Que ótimo!!! Ficamos felizes em ter você conosco. Irei te mandar a planilha de horários para que possa marcar sua aula');
        await sendHorarios(chat);
        await tryMarkUnread(chat);
        chatState.set(chatId, 'normal');
        return;
      }
      if (isNegative(lower)) {
        await tryMarkUnread(chat);
        await backToMenu(msg);
        return;
      }
      await chat.sendMessage('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    // -------- FLUXO DE ESCOLHA DO PLANO (NOMES) --------
    if (estadoAtual === 'aguardando_plano') {
      if (/(iniciante)/i.test(lower)) {
        await chat.sendMessage('Curtiu o *Iniciante*. Quer marcar uma *aula experimental*?');
        chatState.set(chatId, 'confirma_iniciante');
        return;
      }
      if (/(lutador)/i.test(lower)) {
        await chat.sendMessage('Show! Plano *Lutador*. Quer que eu já te mande os *horários*?');
        chatState.set(chatId, 'confirma_lutador');
        return;
      }
      if (/(campe(ã|a)o|campeao)/i.test(lower)) {
        await chat.sendMessage('Top! Plano *Campeão*. Quer que eu te mande a *planilha de horários*?');
        chatState.set(chatId, 'confirma_campeao');
        return;
      }
      if (/(gympass|wellhub|welhub|gimpass|ginpass|ginpas|gympas|gimpas)/i.test(lower)) {
        await chat.sendMessage('Fico muito feliz que tenha nos encontrado pelo Wellhub/Gympass!!Quer marcar uma aula?');
        chatState.set(chatId, 'confirma_gpass');
        return; // evita cair no "não entendi"
      }

      await chat.sendMessage('Não entendi 🤔. Diga o *nome* de um plano (Iniciante, Lutador, Campeão) ou digite *menu*.');
      return;
    }

    // -------- FLUXO DE ESCOLHA DO MENU (NÚMEROS) --------
    if (estadoAtual === 'aguardando_opcao') {
      if (/^[0-6]$/.test(text)) {
        await handleMenuOption(msg, text); // esta função também ajusta o estado
      } else {
        await chat.sendMessage('Por favor, digite um número de 0 a 6 ou *menu* para ver o menu.');
      }
      return;
    }
  } catch (err) {
    console.error('[BOT][on message] erro inesperado:', err);
  }
});

// ---------- MENSAGENS ----------
async function sendWelcomeMenu(msg: Message): Promise<void> {
  const chat: Chat = await msg.getChat();
  const contact: Contact = await msg.getContact();
  const nome = contact.pushname?.split(' ')[0] || 'amigo';

  await tryTyping(chat);
  await chat.sendMessage(
    `Olá ${nome}, bem-vindo ao CT Jhonny Alves! 🤖\n` +
    `Serei seu assistente virtual. Se quiser ver o menu novamente, digite *menu*.\n\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
    `6 – Atendimento Pessoal \n` +
    `0 – Encerrar atendimento`
  );
}

async function sendMenu(msg: Message): Promise<void> {
  const chat: Chat = await msg.getChat();
  await chat.sendMessage(
    `Menu:\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
    `6 – Atendimento Pessoal \n` +
    `0 – Encerrar atendimento`
  );
}

// ---------- MENU ----------
async function handleMenuOption(msg: Message, option: string): Promise<void> {
  const chat: Chat = await msg.getChat();
  const chatId = msg.from;

  switch (option) {
    case '1': {
      const resposta =
        `*Modalidades do CT*:\n- Muay Thai, Boxe, Jiu Jitsu, Capoeira, Treino Funcional\n` +
        `*Unidades*:\n• Saraiva: Rua Tapajós, 767\n• Santa Mônica: Rua José Carrijo, 195\n` +
        `Atendemos todos os níveis: iniciantes a competidores profissionais.\n\n` +
        `Temos modalidades específicas para mulheres e crianças também\n\n` +
        `Siga nossa página no instagram @ctjhonnyalves (https://www.instagram.com/ctjhonnyalves)\n\n` +
        `Se quiser ver as opções novamente é só digitar *menu* 😉`;
      await chat.sendMessage(resposta);
      chatState.set(chatId, 'normal');
      break;
    }

    case '2': {
      const resposta =
        `*Aula Experimental*:\nPerfeito! 😃\n` +
        `Quando ficaria melhor pra você?\n` +
        `Pra te ajudar, vou te mandar a planilha de horários, só um instante.\n\n` +
        `Se quiser voltar ao menu é só digitar *menu* 😉`;
      await chat.sendMessage(resposta);
      await sendHorarios(chat);
      await tryMarkUnread(chat);
      chatState.set(chatId, 'normal');
      break;
    }

    case '3': {
      const resposta =
        `Treine a hora que quiser!!! Aqui no CT trabalhamos com um sistema de agendamento para te trazer mais conforto e flexibilidade \n\n` +
        `*Planos Disponíveis*:\n- Iniciante (R$99,00): 1 aula/semana\n` +
        `- Lutador* (R$150,00): até 3 aulas/semana + descontos\n` +
        `- Campeão (R$260,00): ilimitado + 1 personal/mês + descontos familiares\n` +
        `- Universitário (R$79,90): 4 aulas/semana + descontos\n` +
        `- Gympass/WellHub: Aceitamos a partir do Plano Basic, 3x semanais (Somente uma Modalidade)\n\n ` +
        `Me sconta *qual plano* te agrada mais (pode escrever o nome do plano).\n\n` +
        `Se quiser ver as opções novamente é só digitar *menu* 😉`;
      await chat.sendMessage(resposta);
      chatState.set(chatId, 'aguardando_plano');
      break;
    }

    case '4': {
      await sendHorarios(chat);
      chatState.set(chatId, 'normal');
      break;
    }

    case '5': {
      await chat.sendMessage(PAGAMENTOS);
      chatState.set(chatId, 'normal');
      break;
    }

    case '6': {
      await chat.sendMessage('Ok! Assim que possível, um de nossos professores irá entrar em contato');
      chatState.set(chatId, 'normal');
      await tryMarkUnread(chat);
      break; // corrigido
    }

    case '0': {
      await chat.sendMessage('Encerrando atendimento. Se precisar de algo mais, digite *menu*.');
      chatState.set(chatId, 'normal');
      break;
    }
  }
}

// ---------- START ----------
client.initialize();

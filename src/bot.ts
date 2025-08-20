import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

// ---------- AJUSTES DE PUPPETEER PARA VM ----------
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
];

// Ative/desative efeitos visuais sem custo alto
const ENABLE_TYPING = false;
const ENABLE_MARK_UNREAD = false;

// ---------- ESTADOS ----------
type ChatMode =
  | 'normal'
  | 'aguardando_opcao'
  | 'aguardando_plano'
  | 'confirma_iniciante'
  | 'confirma_lutador'
  | 'confirma_campeao'
  | 'confirma_gpass';

const chatState = new Map<string, ChatMode>();
const lastMenuDayByChat = new Map<string, string>();

// ---------- CLIENT ----------
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: PUPPETEER_ARGS,
    // executablePath: process.env.CHROMIUM_PATH, // opcional: aponte pro Chrome do sistema
  },
  // webVersionCache: { type: 'memory' }, // (opcional) menor I/O que 'local'
});

// ---------- HELPERS ----------
const PAGAMENTOS =
  `*Pagamentos*:\n` +
  `Todos os pagamentos devem ser feitos para:\n` +
  `CNPJ: 58.656.721/0001-34\n` +
  `Titular: João Pedro Alves Santana (Banco Sicred)\n\n` +
  `Se quiser ver as opções novamente é só digitar "menu"😉`;

// Regex pré-compiladas
const RE_MENU = /^(menu)$/i;
const RE_NUM = /^[0-6]$/;
const RE_INICIANTE = /iniciante/i;
const RE_LUTADOR = /lutador/i;
const RE_CAMPEAO = /campe(ã|a)o|campeao/i;
const RE_GYMPASS = /(gympass|wellhub|welhub|gimpass|ginpass|ginpas|gympas|gimpas)/i;
const RE_AFFIRM = /\b(sim|s|quero|claro|ok|blz|beleza|bora|vamos|perfeito|top|quero sim|yes|yep)\b/i;
const RE_NEG = /\b(n[ãa]o|nao|n|agora n[ãa]o|depois|prefiro n[ãa]o|negativo)\b/i;

const currentDateInTZ = (tz = 'America/Sao_Paulo'): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: tz }); // AAAA-MM-DD

// Cache global do PDF (evita I/O a cada envio)
let HORARIOS_MEDIA: MessageMedia | null = null;
function ensureHorariosLoaded() {
  if (HORARIOS_MEDIA) return;
  const mediaPath = path.join(__dirname, '..', 'horarios.pdf');
  if (fs.existsSync(mediaPath)) {
    HORARIOS_MEDIA = MessageMedia.fromFilePath(mediaPath);
  } else {
    HORARIOS_MEDIA = null;
  }
}

async function sendHorariosQuick(msg: Message) {
  ensureHorariosLoaded();
  if (HORARIOS_MEDIA) {
    await msg.reply('*Segue a planilha de horários em PDF:*');
    await msg.reply(HORARIOS_MEDIA);
  } else {
    await msg.reply('⚠️ Arquivo de horários não encontrado no servidor.');
  }
}

async function backToMenu(msg: Message) {
  await msg.reply('Sem problema! Voltei para o menu pra você 👍');
  await sendMenu(msg);
  chatState.set(msg.from, 'aguardando_opcao');
}

// Helpers “seguros” (desligados por padrão)
async function tryTyping(msg: Message) {
  if (!ENABLE_TYPING) return;
  try { const chat = await msg.getChat(); await chat.sendStateTyping(); } catch {}
}
async function tryMarkUnread(msg: Message) {
  if (!ENABLE_MARK_UNREAD) return;
  try { const chat = await msg.getChat(); await chat.markUnread(); } catch {}
}

// ---------- BOOT ----------
client.on('qr', (qr: string) => {
  console.log('QR recebido, escaneie para autenticar:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Robô pronto para funcionar');
  ensureHorariosLoaded(); // carrega mídia 1x
});

// ---------- CORE ----------
client.on('message', async (msg: Message) => {
  try {
    // Somente em chats privados
    if (!msg.from.endsWith('@c.us')) return;

    const chatId = msg.from;
    const textRaw = msg.body || '';
    const text = textRaw.trim();
    const lower = text.toLowerCase();

    // estado default
    if (!chatState.has(chatId)) chatState.set(chatId, 'normal');

    // 1) 1ª mensagem do dia -> manda menu e encerra processamento
    const today = currentDateInTZ();
    if (lastMenuDayByChat.get(chatId) !== today) {
      await sendWelcomeMenu(msg);           // 1 mensagem (sem getContact)
      lastMenuDayByChat.set(chatId, today);
      if (chatState.get(chatId) === 'normal') chatState.set(chatId, 'aguardando_opcao');
      return; // evita cair no restante do fluxo
    }

    // 2) fluxo normal
    let estadoAtual = chatState.get(chatId) as ChatMode;

    // /menu a qualquer momento
    if (RE_MENU.test(lower)) {
      await sendMenu(msg);
      chatState.set(chatId, 'aguardando_opcao');
      return;
    }

    // -------- CONFIRMAÇÕES --------
    if (estadoAtual === 'confirma_iniciante') {
      if (RE_AFFIRM.test(lower)) {
        await tryTyping(msg);
        await msg.reply(
          'Boa decisão! 🎯 A *aula experimental* é a melhor forma de sentir o ritmo e conhecer os professores.\n' +
          'Dá pra ajustar a intensidade, tirar dúvidas e achar o melhor horário pra você.\n\nVou te mandar a planilha de horários:'
        );
        await sendHorariosQuick(msg);
        await msg.reply(PAGAMENTOS);
        await tryMarkUnread(msg);
        chatState.set(chatId, 'normal');
        return;
      }
      if (RE_NEG.test(lower)) {
        await tryMarkUnread(msg);
        await backToMenu(msg);
        return;
      }
      await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_lutador') {
      if (RE_AFFIRM.test(lower)) {
        await sendHorariosQuick(msg);
        await msg.reply(PAGAMENTOS);
        await tryMarkUnread(msg);
        chatState.set(chatId, 'normal');
        return;
      }
      if (RE_NEG.test(lower)) {
        await tryMarkUnread(msg);
        await backToMenu(msg);
        return;
      }
      await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_campeao') {
      if (RE_AFFIRM.test(lower)) {
        await sendHorariosQuick(msg);
        await msg.reply(PAGAMENTOS);
        await tryMarkUnread(msg);
        chatState.set(chatId, 'normal');
        return;
      }
      if (RE_NEG.test(lower)) {
        await tryMarkUnread(msg);
        await backToMenu(msg);
        return;
      }
      await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    if (estadoAtual === 'confirma_gpass') {
      if (RE_AFFIRM.test(lower)) {
        await msg.reply('Que ótimo!!! Ficamos felizes em ter você conosco. Vou te mandar a planilha de horários para que possa marcar sua aula.');
        await sendHorariosQuick(msg);
        await tryMarkUnread(msg);
        chatState.set(chatId, 'normal');
        return;
      }
      if (RE_NEG.test(lower)) {
        await tryMarkUnread(msg);
        await backToMenu(msg);
        return;
      }
      await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
      return;
    }

    // -------- FLUXO DE ESCOLHA DO PLANO (NOMES) --------
    if (estadoAtual === 'aguardando_plano') {
      if (RE_INICIANTE.test(lower)) {
        await msg.reply('Curtiu o *Iniciante*. Quer marcar uma *aula experimental*?');
        chatState.set(chatId, 'confirma_iniciante');
        return;
      }
      if (RE_LUTADOR.test(lower)) {
        await msg.reply('Show! Plano *Lutador*. Quer que eu já te mande os *horários*?');
        chatState.set(chatId, 'confirma_lutador');
        return;
      }
      if (RE_CAMPEAO.test(lower)) {
        await msg.reply('Top! Plano *Campeão*. Quer que eu te mande a *planilha de horários*?');
        chatState.set(chatId, 'confirma_campeao');
        return;
      }
      if (RE_GYMPASS.test(lower)) {
        await msg.reply('Fico muito feliz que tenha nos encontrado pelo Wellhub/Gympass! Quer que eu te mande a *planilha de horários*?');
        chatState.set(chatId, 'confirma_gpass');
        return;
      }

      await msg.reply('Não entendi 🤔. Diga o *nome* de um plano (Iniciante, Lutador, Campeão) ou digite *menu*.');
      return;
    }

    // -------- FLUXO DE ESCOLHA DO MENU (NÚMEROS) --------
    if (estadoAtual === 'aguardando_opcao') {
      if (RE_NUM.test(text)) {
        await handleMenuOption(msg, text);
      } else {
        await msg.reply('Por favor, digite um número de 0 a 6 ou *menu* para ver o menu.');
      }
      return;
    }

  } catch (err) {
    console.error('[BOT][on message] erro inesperado:', err);
  }
});

// ---------- MENSAGENS ----------
async function sendWelcomeMenu(msg: Message): Promise<void> {
  // Sem getContact (mais barato). Se quiser nome, busque só quando necessário.
  await msg.reply(
    `Olá! 🤖 Bem-vindo ao CT Jhonny Alves!\n` +
    `Se quiser ver o menu novamente, digite *menu*.\n\n` +
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
  await msg.reply(
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
      await msg.reply(resposta);
      chatState.set(chatId, 'normal');
      break;
    }

    case '2': {
      const resposta =
        `*Aula Experimental*:\nPerfeito! 😃\n` +
        `Quando ficaria melhor pra você?\n` +
        `Pra te ajudar, vou te mandar a planilha de horários, só um instante.\n\n` +
        `Se quiser voltar ao menu é só digitar *menu* 😉`;
      await msg.reply(resposta);
      await sendHorariosQuick(msg);
      await tryMarkUnread(msg);
      chatState.set(chatId, 'normal');
      break;
    }

    case '3': {
      const resposta =
        `Treine a hora que quiser!!! Aqui no CT trabalhamos com um sistema de agendamento para te trazer mais conforto e flexibilidade.\n\n` +
        `*Planos Disponíveis*:\n` +
        `- Iniciante (R$99,00): 1 aula/semana\n` +
        `- Lutador (R$150,00): até 3 aulas/semana + descontos\n` +
        `- Campeão (R$260,00): ilimitado + 1 personal/mês + descontos familiares\n` +
        `- Universitário (R$79,90): 4 aulas/semana + descontos\n` +
        `- Gympass/Wellhub: aceitamos a partir do *Plano Basic*, 3x semanais (somente uma modalidade)\n\n` +
        `Me conta *qual plano* te agrada mais (pode escrever o nome do plano).\n\n` +
        `Se quiser ver as opções novamente é só digitar *menu* 😉`;
      await msg.reply(resposta);
      chatState.set(chatId, 'aguardando_plano');
      break;
    }

    case '4': {
      await sendHorariosQuick(msg);
      chatState.set(chatId, 'normal');
      break;
    }

    case '5': {
      await msg.reply(PAGAMENTOS);
      chatState.set(chatId, 'normal');
      break;
    }

    case '6': {
      await msg.reply('Ok! Assim que possível, um de nossos professores irá entrar em contato.');
      chatState.set(chatId, 'normal');
      await tryMarkUnread(msg);
      break;
    }

    case '0': {
      await msg.reply('Encerrando atendimento. Se precisar de algo mais, digite *menu*.');
      chatState.set(chatId, 'normal');
      break;
    }
  }
}

// ---------- START ----------
client.initialize();

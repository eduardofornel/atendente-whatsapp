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
  | 'confirma_campeao';

const chatState: Map<string, ChatMode> = new Map();

// ---------- CLIENT ----------
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // Se estiver usando puppeteer-core + Chrome do sistema, defina:
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

async function sendHorarios(chat: Chat) {
  // IMPORTANTE: garanta que o horarios.pdf esteja UMA pasta acima do dist/
  // Ex.: projeto/
  //  ├─ src/
  //  ├─ dist/
  //  └─ horarios.pdf
  const mediaPath = path.join(__dirname, '..', 'horarios.pdf');
  if (fs.existsSync(mediaPath)) {
    const media = MessageMedia.fromFilePath(mediaPath);
    await chat.sendMessage('*Segue a planilha de horários em PDF:*');
    await chat.sendMessage(media);
  } else {
    await chat.sendMessage('⚠️ Arquivo de horários não encontrado no servidor.');
  }
}

async function backToMenu(msg: Message) {
  await msg.reply('Sem problema! Voltei para o menu pra você 👍');
  await sendMenu(msg);
  chatState.set(msg.from, 'aguardando_opcao');
}

// ---------- EVENTOS ----------
client.on('qr', (qr: string) => {
  console.log('QR recebido, escaneie para autenticar:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Robô pronto para funcionar');
});

client.on('message', async (msg: Message) => {
  // Somente em chats privados
  if (!msg.from.endsWith('@c.us')) return;

  const chatId = msg.from;
  const text = msg.body.trim();
  const lower = text.toLowerCase();
  const estadoAtual = chatState.get(chatId) ?? 'normal';
  const chat: Chat = await msg.getChat();

  // /menu a qualquer momento
  if (/^(menu)$/.test(lower)) {
    await sendMenu(msg);
    chatState.set(chatId, 'aguardando_opcao');
    return;
  }

  // -------- CONFIRMAÇÕES POR PLANO --------
  if (estadoAtual === 'confirma_iniciante') {
    if (isAffirmative(lower)) {
      await chat.sendMessage(
        'Boa decisão! 🎯 A *aula experimental* é a melhor forma de sentir o ritmo e conhecer os professores. ' +
        'Dá pra ajustar a intensidade, tirar dúvidas e achar o melhor horário pra você.\n\nVou te mandar a planilha de horários:'
      );
      await sendHorarios(chat);
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      chatState.set(chatId, 'normal');
      return;
    }
    if (isNegative(lower)) {
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      await backToMenu(msg);
      return;
    }
    await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
    return;
  }

  if (estadoAtual === 'confirma_lutador') {
    if (isAffirmative(lower)) {
      await sendHorarios(chat);
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      chatState.set(chatId, 'normal');
      return;
    }
    if (isNegative(lower)) {
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      await backToMenu(msg);
      return;
    }
    await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
    return;
  }

  if (estadoAtual === 'confirma_campeao') {
    if (isAffirmative(lower)) {
      await sendHorarios(chat);
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      chatState.set(chatId, 'normal');
      return;
    }
    if (isNegative(lower)) {
      await chat.sendMessage(PAGAMENTOS);
      await chat.markUnread();
      await backToMenu(msg);
      return;
    }
    await msg.reply('Responde com *sim* ou *não*, por favor. (ou digite *menu* para voltar)');
    return;
  }

  // -------- FLUXO DE ESCOLHA DO PLANO (NOMES) --------
  if (estadoAtual === 'aguardando_plano') {
    if (/(iniciante)/i.test(lower)) {
      await msg.reply('Curtiu o *Iniciante*. Quer marcar uma *aula experimental*?');
      chatState.set(chatId, 'confirma_iniciante');
      return;
    }
    if (/(lutador)/i.test(lower)) {
      await msg.reply('Show! Plano *Lutador*. Quer que eu já te mande os *horários*?');
      chatState.set(chatId, 'confirma_lutador');
      return;
    }
    if (/(campe(ã|a)o|campeao)/i.test(lower)) {
      await msg.reply('Top! Plano *Campeão*. Quer que eu te mande a *planilha de horários*?');
      chatState.set(chatId, 'confirma_campeao');
      return;
    }

    await msg.reply('Não entendi 🤔. Diga o *nome* de um plano (Iniciante, Lutador, Campeão) ou digite *menu*.');
    return;
  }

  // -------- FLUXO DE ESCOLHA DO MENU (NÚMEROS) --------
  if (estadoAtual === 'aguardando_opcao') {
    if (/^[0-5]$/.test(text)) {
      await handleMenuOption(msg, text); // esta função também ajusta o estado
    } else {
      await msg.reply('Por favor, digite um número de 0 a 5 ou *menu* para ver o menu.');
    }
    return;
  }

  // -------- SAUDAÇÃO INICIAL --------
  if (/^(oi|olá|ola|dia|tarde|noite|jonny|jhony|jony|jhonny)$/.test(lower)) {
    await sendWelcomeMenu(msg);
    chatState.set(chatId, 'aguardando_opcao');
    return;
  }
});

// ---------- MENSAGENS ----------
async function sendWelcomeMenu(msg: Message): Promise<void> {
  const chat: Chat = await msg.getChat();
  const contact: Contact = await msg.getContact();
  const nome = contact.pushname?.split(' ')[0] || 'amigo';

  await chat.sendStateTyping();
  await delay(800);
  await chat.sendMessage(
    `Olá ${nome}, bem-vindo ao CT Jhonny Alves! 🤖\n` +
    `Serei seu assistente virtual. Se quiser ver o menu novamente, digite *menu*.\n\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
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
      await chat.markUnread();

      chatState.set(chatId, 'normal');
      break;
    }

    case '3': {
      const resposta =
        `*Planos Disponíveis*:\n- Iniciante (R$99,00): 1 aula/semana\n` +
        `- Lutador (R$150,00): até 3 aulas/semana + descontos\n` +
        `- Campeão (R$260,00): ilimitado + 1 personal/mês + descontos familiares\n` +
        `- Universitário (R$79,90): 4 aulas/semana + descontos (exclusivo UFU)\n\n` +
        `Me conta *qual plano* te agrada mais (pode escrever o nome).\n\n` +
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

    case '0': {
      await chat.sendMessage('Encerrando atendimento. Se precisar de algo mais, digite *menu*.');
      chatState.set(chatId, 'normal');
      break;
    }
  }
}

// ---------- START ----------
client.initialize();

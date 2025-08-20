import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';

// -------------------------
// Configurações do Puppeteer
// -------------------------
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-zygote',
  '--disable-gpu',
];

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: PUPPETEER_ARGS, headless: true }
});

// -------------------------
// Estados do Chat
// -------------------------
type ChatMode =
  | 'normal'
  | 'aguardando_opcao'
  | 'aguardando_plano'
  | 'confirma_iniciante'
  | 'confirma_lutador'
  | 'confirma_campeao';

const chatState: Map<string, ChatMode> = new Map();
const lastMenuDayByChat: Map<string, string> = new Map();

// -------------------------
// Funções Auxiliares
// -------------------------
async function sendWelcomeMenu(msg: Message) {
  const chat = await msg.getChat();
  await chat.sendMessage(
    `Olá, bem-vindo ao CT Jhonny Alves! 🤖\n` +
    `Serei seu assistente virtual. Se quiser ver o menu novamente, digite menu.\n\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
    `6 – Atendimento Pessoal\n` +
    `0 – Encerrar atendimento`
  );
}

async function sendHorariosQuick(msg: Message) {
  const chat = await msg.getChat();
  const media = MessageMedia.fromFilePath(path.join(__dirname, '..', 'horarios.pdf'));
  await chat.sendMessage(media, {
    caption: '*Segue a planilha de horários em PDF:*'
  });
}

// -------------------------
// Listener de QRCode e Ready
// -------------------------
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🤖 Bot pronto!');
});

// -------------------------
// Listener de Mensagens
// -------------------------
client.on('message', async (msg: Message) => {
  try {
    const chat = await msg.getChat();
    const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd

    const currentState = chatState.get(msg.from) || 'normal';
    const lastDay = lastMenuDayByChat.get(msg.from);

    // Primeira mensagem do dia → manda menu e não processa mais nada
    if (lastDay !== today) {
      await sendWelcomeMenu(msg);
      lastMenuDayByChat.set(msg.from, today);
      chatState.set(msg.from, 'aguardando_opcao');
      return;
    }

    const body = msg.body.trim().toLowerCase();

    // -------------------------
    // Tratamento de estados
    // -------------------------
    switch (currentState) {
      case 'aguardando_opcao':
        switch (body) {
          case '1':
            await chat.sendMessage('O CT Jhonny Alves é referência em treinamento de Muay Thai! 🥊');
            break;

          case '2':
            await chat.sendMessage(
              'Gostaria de marcar uma aula experimental? (responda "sim" ou "não")'
            );
            chatState.set(msg.from, 'confirma_iniciante');
            break;

          case '3':
            await chat.sendMessage(
              'Temos os seguintes planos:\n\n' +
              '🥋 Iniciante\n' +
              '🥊 Lutador\n' +
              '🏆 Campeão\n\n' +
              'Digite o nome do plano para mais informações.'
            );
            chatState.set(msg.from, 'aguardando_plano');
            break;

          case '4':
            await sendHorariosQuick(msg);
            break;

          case '5':
            await chat.sendMessage(
              '*Pagamentos*\n\nAceitamos PIX, cartão de crédito e boleto bancário.'
            );
            break;

          case '6':
            await chat.sendMessage(
              'Um de nossos atendentes entrará em contato com você em breve. Obrigado!'
            );
            break;

          case '0':
            await chat.sendMessage(
              'Atendimento encerrado. Obrigado por entrar em contato!'
            );
            chatState.set(msg.from, 'normal');
            break;

          default:
            await chat.sendMessage(
              'Por favor, digite um número de 0 a 6 ou "menu" para ver o menu.'
            );
        }
        break;

      case 'aguardando_plano':
        if (body.includes('iniciante')) {
          await chat.sendMessage(
            'Plano Iniciante: ideal para quem está começando no Muay Thai. 💪\nDeseja confirmar? (sim/não)'
          );
          chatState.set(msg.from, 'confirma_iniciante');
        } else if (body.includes('lutador')) {
          await chat.sendMessage(
            'Plano Lutador: treinos intermediários para evolução constante. 🥊\nDeseja confirmar? (sim/não)'
          );
          chatState.set(msg.from, 'confirma_lutador');
        } else if (body.includes('campeão') || body.includes('campeao')) {
          await chat.sendMessage(
            'Plano Campeão: treinos avançados para performance máxima. 🏆\nDeseja confirmar? (sim/não)'
          );
          chatState.set(msg.from, 'confirma_campeao');
        } else {
          await chat.sendMessage('Plano não reconhecido. Digite "iniciante", "lutador" ou "campeão".');
        }
        break;

      case 'confirma_iniciante':
      case 'confirma_lutador':
      case 'confirma_campeao':
        if (body === 'sim' || body === 's') {
          await chat.sendMessage('Ótimo! Segue abaixo os horários:');
          await sendHorariosQuick(msg);
          await chat.sendMessage(
            '*Pagamentos*\n\nAceitamos PIX, cartão de crédito e boleto bancário.'
          );
        } else {
          await chat.sendMessage('Beleza! Voltando ao menu principal...');
          await sendWelcomeMenu(msg);
          chatState.set(msg.from, 'aguardando_opcao');
        }
        break;

      default:
        if (body === 'menu') {
          await sendWelcomeMenu(msg);
          chatState.set(msg.from, 'aguardando_opcao');
        }
        break;
    }
  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
  }
});

// -------------------------
// Inicializa o Bot
// -------------------------
client.initialize();

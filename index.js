const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});


client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true })
    console.log("Escaneie para iniciar")
});

client.on('ready', () => {
    console.log('Robô pronto para funcionar');
});

client.initialize();

const delay = ms => new Promise(res => setTimeout(res, ms));


client.on('message', async msg => {
    if (msg.from.endsWith('@c.us')) {

        //colocar verificação para ver se é a primeira mensagem do chat
        if (msg.body.toLowerCase().match(/oi|ola|olá|dia|tarde|noite/i)) {

            const chat = await msg.getChat() // vai pro chat que recebeu a mensagem

            bot.digitando(3000)

            const contact = await msg.getContact(); //Pegando o contato
            const name = contact.pushname; //Pegando o nome do contato

            await chat.sendMessage(mensagens.apresentacao(name.split(" ")[0]));
            bot.digitando(2000)
            await chat.sendMessage(mensagens.msgApresentacao2);
            bot.digitando(2000)
            await chat.sendMessage(menuApresentacao)

            if (text === '/menu') {
                await sendFullMenu(msg.body);
                return;
            }

            // Se for opção numérica, processa
            if (/^[0-5]$/.test(text)) {
                await handleMenuOption(msg.body, text);
                return;
            }

        }
    }

})

async function handleMenuOption(msg, option) {
    let resposta = '';
    switch (option) {
        case '1':
            resposta =
                `*Modalidades do CT*:
- Muay Thai, Boxe, Jiu Jitsu, Capoeira, Treino Funcional
*Unidades*:
• Saraiva: Rua Tapajós, 767
• Santa Mônica: Rua José Carrijo, 195
Atendemos todos os níveis: iniciantes a competidores profissionais.`;
            break;
        case '2':
            resposta =
                `*Aula Experimental*:
Perfeito! 😃
Por favor, informe seus dias e períodos de preferência.
Se quiser ver a planilha de horários, digite *4* ou *\/menu* novamente.`;
            break;
        case '3':
            resposta =
                `*Planos Disponíveis*:
- Iniciante (R$99,00): 1 aula/semana
- Lutador (R$150,00): até 3 aulas/semana + descontos
- Campeão (R$260,00): ilimitado + 1 personal/mês + descontos familiares
- Universitário (R$79,90)*: 4 aulas/semana + descontos (*exclusivo UFU*)`;
            break;
        case '4':
            resposta =
                `*Planilha de Horários*:
• Saraiva: https://link.exemplo/saraiva-horarios
• Santa Mônica: https://link.exemplo/santamonica-horarios`;
            break;
        case '5':
            resposta =
                `*Pagamentos*:
Todos os pagamentos devem ser feitos para:
CNPJ: 58.656.721/0001-34
Titular: João Pedro Alves Santana (Banco Sicoob)`;
            break;
        case '0':
            resposta = `Encerrando atendimento. Se precisar de algo mais, é só chamar!`;
            break;
    }
    await msg.reply(resposta);
}




class Bot {

    async digitando(delayMs) {
        await delay(delayMs);
        await chat.sendStateTyping();
        await delay(delayMs);
    }

    pegaInfosContato() {

    }

}

class Mensagens {

    apresentacao(nomeContato) {
        msgApresentacao = `Olá ${nomeContato}, bem vindo ao CT Jhonny Alves. Serei seu assistente virtual e irei lhe auxiliar nas dúvidas que tiver.`;
        msgApresentacao2 = "Irei te enviar um menu com os assuntos em que posso te ajudar, se por acaso precisar do MENU novamente, é só digitar */menu* que te encaminho de novo, tudo bem?"
        menuApresentacao = "Digite um número para escolher a respectiva opção\n\n1 - Gostaria de conhecer o CT.\n2 - Gostaria de marcar uma aula experimental.\n3 - Gostaria de saber mais sobre os planos.\n4 - Gostaria de checar a planilha de horários.\n5 - Gostaria de saber sobre pagamentos.\n0 - Outros assuntos.\n"
    }

    mensagemMenu() {

    }
}



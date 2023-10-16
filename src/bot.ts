import { ChannelType, Client, Events, IntentsBitField, Partials, PermissionsBitField, TextChannel } from "discord.js";

const bot = new Client({
    intents:
        IntentsBitField.Flags.Guilds | IntentsBitField.Flags.GuildMessageReactions | IntentsBitField.Flags.GuildMessages | IntentsBitField.Flags.MessageContent,
    partials: [Partials.Message, Partials.Reaction],
});

await bot.login(Bun.env.TOKEN);

await new Promise((r) => bot.on(Events.ClientReady, r));

export default bot;

const channel = await bot.channels.fetch(Bun.env.OUTPUT!);

if (channel!.type !== ChannelType.GuildText) throw new Error("Invalid channel type.");

if (
    !channel.guild.members.me?.permissions.has(
        PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.EmbedLinks,
    )
)
    throw new Error("Missing permissions in guild.");

if (
    !channel.guild.members.me
        ?.permissionsIn(channel)
        .has(PermissionsBitField.Flags.ViewChannel | PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.EmbedLinks)
)
    throw new Error("Missing permissions in output channel.");

const _: TextChannel = channel;
export { _ as channel };

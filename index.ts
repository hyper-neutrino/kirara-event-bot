import {
    ButtonStyle,
    Client,
    ComponentType,
    Events,
    IntentsBitField,
    OverwriteType,
    Partials,
    PermissionFlagsBits,
    TextChannel,
    TextInputStyle,
} from "discord.js";
import db from "./src/db.ts";
import logger from "./src/logger.ts";

process.on("uncaughtException", (error) => logger.error(error, "uncaught @ top level"));

const colors = {
    green: [1, Infinity, false],
    yellow: [3, 20, false],
    teal: [5, 15, false],
    purple: [10, 5, true],
} as Record<string, [number, number, boolean]>;

const bot = new Client({
    intents:
        IntentsBitField.Flags.Guilds | IntentsBitField.Flags.GuildMessageReactions | IntentsBitField.Flags.GuildMessages | IntentsBitField.Flags.MessageContent,
    partials: [Partials.Message, Partials.Reaction],
    allowedMentions: { parse: [] },
});

const promise = new Promise((r) => bot.on(Events.ClientReady, r));
await bot.login(Bun.env.TOKEN);
await promise;

const output = (await bot.channels.fetch(Bun.env.OUTPUT!)) as TextChannel;
const logs = (await bot.channels.fetch(Bun.env.LOGS!)) as TextChannel;

bot.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (!reaction.message.guild) return;

    const doc = await db.messages.findOneAndUpdate({ id: reaction.message.id, remaining: { $gt: 0 } }, { $inc: { remaining: -1 } });
    if (!doc) return;

    const findDoc = await db.finds.findOneAndUpdate({ user: user.id, message: reaction.message.id }, { $set: { user: user.id } }, { upsert: true });
    if (findDoc) return;

    const userDoc = await db.users.findOneAndUpdate(
        { id: user.id },
        { $inc: { points: doc.points, modals: doc.modal ? 1 : 0 } },
        { upsert: true, returnDocument: "after" },
    );

    if (doc.modal) {
        const channel = await reaction.message.guild.channels.create({
            name: `${user.tag}`,
            permissionOverwrites: [
                {
                    id: reaction.message.guild.roles.everyone.id,
                    type: OverwriteType.Role,
                    deny: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
                },
                { id: bot.user!.id, type: OverwriteType.Member, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages },
                { id: user.id, type: OverwriteType.Member, allow: PermissionFlagsBits.ViewChannel },
            ],
        });

        await channel.send({
            content: `${user}`,
            embeds: [
                {
                    title: "Congratulations! You have found a purple cardamom.",
                    description: "Click the button below to submit a change request for the wheel this round.",
                    color: 0x2b2d31,
                },
            ],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [{ type: ComponentType.Button, style: ButtonStyle.Secondary, customId: "initiate", label: "Open Modal" }],
                },
            ],
            allowedMentions: { users: [user.id] },
        });
    }

    logs.send(
        `${user} found \`${doc.id}\`, gaining ${doc.points} point${doc.points === 1 ? "" : "s"} (now at ${userDoc?.points}); modal ${
            doc.modal ? "was" : "was not"
        } shown`,
    );
});

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && interaction.customId === "initiate")
        return void interaction.showModal({
            title: "Submit Change Request",
            customId: "finalize",
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        {
                            type: ComponentType.TextInput,
                            style: TextInputStyle.Paragraph,
                            customId: "input",
                            label: "Change Request",
                            placeholder: "Submit your change request here.",
                            maxLength: 1024,
                            required: true,
                        },
                    ],
                },
            ],
        });
    else if (interaction.isModalSubmit() && interaction.customId === "finalize") {
        await interaction.deferUpdate();
        const input = interaction.fields.getTextInputValue("input");

        await output.send({
            embeds: [
                {
                    author: { name: interaction.user.username, icon_url: interaction.user.displayAvatarURL() },
                    title: "New Change Request",
                    description: input,
                    color: 0x2b2d31,
                    footer: { text: interaction.user.id },
                },
            ],
        });

        await interaction.editReply({
            embeds: [
                {
                    title: "Request Submitted!",
                    description: "Your request has been submitted. Thank you for participating! This channel will be deleted shortly.",
                    color: 0x2b2d31,
                },
            ],
            components: [],
        });

        setTimeout(() => interaction.channel?.delete(), 10000);
    }
});

bot.on(Events.MessageCreate, async (message) => {
    if (!message.content.startsWith("hs?")) return;

    const [command, ...args] = message.content.slice(3).trim().split(/\s+/);

    if (command === "promote" || command === "demote") {
        if (message.author.id !== Bun.env.OWNER) return;

        const [_id] = args;
        const id = _id?.match(/^<@!?([1-9][0-9]{16,19})>$/)?.[1] ?? _id;

        if (!id.match(/^[1-9][0-9]{16,19}$/)) return void message.reply(`**Usage:** \`hs?${command} <user ID>\``);

        if (command === "promote") {
            const doc = await db.admins.findOneAndUpdate({ id }, { $set: { id } }, { upsert: true });
            if (doc) return void message.reply(`<@${id}> is already an admin.`);

            message.reply(`<@${id}> is now an admin.`);
        } else if (command === "demote") {
            const { deletedCount } = await db.admins.deleteOne({ id });
            if (deletedCount === 0) return void message.reply(`<@${id}> is not an admin.`);

            message.reply(`<@${id}> is no longer an admin.`);
        }
    } else if (command === "add" || command === "remove" || command === "check" || command === "dump") {
        if (message.author.id !== Bun.env.OWNER && (await db.admins.countDocuments({ id: message.author.id })) === 0) return;

        if (command === "add") {
            const [color, id] = args;

            if (args.length !== 2 || !(color in colors) || !id.match(/^[1-9][0-9]{16,19}$/))
                return void message.reply(`**Usage:** \`hs?add <${Object.keys(colors).join(" | ")}> <message ID>\``);

            const [points, remaining, modal] = colors[color];

            const doc = await db.messages.findOneAndUpdate({ id }, { $setOnInsert: { points, remaining, modal } }, { upsert: true });
            if (doc) return void message.reply(`That message is already added. If you want to set it differently, use \`hs?remove ${id}\` first.`);

            message.reply(`\`${id}\` has been added. Use \`hs?check [message ID]\` to view info on a specific message or all recorded messages.`);

            logs.send(
                `message \`${id}\` added: ${points} point${points === 1 ? "" : "s"} per find, ${remaining} find${remaining === 1 ? "" : "s"} remaining, ${
                    modal ? "will" : "won't"
                } show modal on find`,
            );
        } else if (command === "remove") {
            const [id] = args;

            if (args.length !== 1 || !id.match(/^[1-9][0-9]{16,19}$/)) return void message.reply(`**Usage:** \`hs?remove <message ID>\``);

            const doc = await db.messages.findOneAndDelete({ id });
            if (!doc) return void message.reply(`That message is not in the database.`);

            message.reply(`\`${id}\` has been removed.`);
            logs.send(`message \`${id}\` removed from database`);
        } else if (command === "check") {
            const [id] = args;

            if (args.length > 1) return void message.reply(`**Usage:** \`hs?check [message ID]\``);
            else if (args.length === 0) {
                const docs = await db.messages.find().toArray();

                const text = docs
                    .map(
                        (x) =>
                            `\`${x.id}\`: ${x.points} point${x.points === 1 ? "" : "s"} each, ${x.remaining} remaining allowed find${
                                x.remaining === 1 ? "" : "s"
                            }, ${x.modal ? "will" : "won't"} show modal on find`,
                    )
                    .join("\n");

                if (text.length <= 2000) message.reply(text);
                else message.reply({ files: [{ name: "data.txt", attachment: Buffer.from(text, "utf-8") }] });
            } else if (args.length === 1) {
                const doc = await db.messages.findOne({ id });
                if (!doc) return void message.reply(`\`${id}\` is not in the database.`);

                message.reply(
                    `\`${doc.id}\`: ${doc.points} point${doc.points === 1 ? "" : "s"} each, ${doc.remaining} remaining allowed find${
                        doc.remaining === 1 ? "" : "s"
                    }, ${doc.modal ? "will" : "won't"} show modal on find`,
                );
            }
        } else if (command === "dump") {
            const docs = await db.users.find().sort("points", -1).toArray();
            const finds = await db.finds.find().toArray();

            const map: Record<string, number> = {};
            for (const find of finds) map[find.user] = (map[find.user] ?? 0) + 1;

            message.reply({
                files: [
                    {
                        name: "dump.txt",
                        attachment: Buffer.from(
                            docs
                                .map(
                                    (x) =>
                                        `${x.id}: ${x.points} point${x.points === 1 ? "" : "s"}, ${x.modals} modal${x.modals === 1 ? "" : "s"}, ${
                                            map[x.id] ?? 0
                                        } find${map[x.id] === 1 ? "" : "s"} total`,
                                )
                                .join("\n"),
                            "utf-8",
                        ),
                    },
                ],
            });
        }
    } else if (command === "leaderboard" || command === "lb") {
        const [_page] = args;
        const page = args.length === 0 ? 0 : parseInt(_page) - 1;

        if (args.length > 1 || isNaN(page) || page < 0) return void message.reply(`**Usage:** \`hs?${command} [page = 1]\``);

        const docs = await db.users
            .find()
            .sort("points", -1)
            .skip(page * 20)
            .limit(20)
            .toArray();

        message.reply({
            embeds: [
                {
                    title: "Hide & Seek Leaderboard",
                    description: docs.map((x) => `<@${x.id}>: ${x.points} point${x.points === 1 ? "" : "s"}`).join("\n"),
                    color: 0x2b2d31,
                },
            ],
        });
    } else if (command === "points" || command === "pts") {
        const [_id] = args;
        const id = _id?.match(/^<@!?([1-9][0-9]{16,19})>$/)?.[1] ?? _id ?? message.author.id;

        if (!id.match(/^[1-9][0-9]{16,19}$/)) return void message.reply(`**Usage:** \`hs?${command} <user ID>\``);

        const doc = (await db.users.findOne({ id })) ?? { id, points: 0 };

        message.reply({
            embeds: [
                {
                    title: "Hide & Seek Score",
                    description: `<@${doc.id}> has ${doc.points} point${doc.points === 1 ? "" : "s"}!`,
                    color: 0x2b2d31,
                },
            ],
        });
    }
});

logger.info("Bot online.");

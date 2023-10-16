import { ButtonStyle, ChannelType, ComponentType, Events, OverwriteType, PermissionsBitField, TextInputStyle } from "discord.js";
import bot, { channel } from "./bot.ts";
import logger from "./logger.ts";
import { add, get, remove } from "./store.ts";

process.on("uncaughtException", (error) => logger.error(error, "uncaught @ top level"));

let ids = get();

bot.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.emoji.id !== Bun.env.EMOJI) return;

    if (!ids.includes(reaction.message.id)) return;

    remove(reaction.message.id);
    ids = get();

    const ch = await channel.guild.channels.create({
        name: "private-channel",
        type: ChannelType.GuildText,
        permissionOverwrites: [
            { allow: PermissionsBitField.Flags.ViewChannel, id: user.id, type: OverwriteType.Member },
            { allow: PermissionsBitField.Flags.ViewChannel | PermissionsBitField.Flags.SendMessages, id: bot.user!.id, type: OverwriteType.Member },
            {
                deny: PermissionsBitField.Flags.ViewChannel | PermissionsBitField.Flags.SendMessages,
                id: channel.guild.roles.everyone.id,
                type: OverwriteType.Role,
            },
        ],
    });

    await ch.send({
        content: `${user}`,
        embeds: [
            {
                title: "Congratulations! You found a hidden cardamom.",
                description: "Click the button below to submit a change for the wheel for this round.",
                color: 0x2b2d31,
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        customId: "initiate",
                        label: "Open Modal",
                    },
                ],
            },
        ],
    });

    await channel.send({
        embeds: [
            {
                title: "Cardamom Found",
                description: `${reaction.message.url} was just found by ${user}!`,
                color: 0x2b2d31,
            },
        ],
    });
});

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && interaction.customId === "initiate") {
        await interaction.showModal({
            title: "Submit Change",
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
                            placeholder: "Submit your change request here!",
                            maxLength: 1024,
                            required: true,
                        },
                    ],
                },
            ],
        });
    } else if (interaction.isModalSubmit() && interaction.customId === "finalize") {
        await interaction.deferUpdate();
        const input = interaction.fields.getTextInputValue("input");

        await channel.send({
            embeds: [
                {
                    author: { name: interaction.user.displayName, icon_url: interaction.user.displayAvatarURL() },
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
                    description: "Your request has been submitted. Thank you for participating! This channel will be deleted in 10 seconds.",
                    color: 0x2b2d31,
                },
            ],
            components: [],
        });

        setTimeout(() => interaction.channel?.delete(), 10000);
    }
});

bot.on(Events.MessageCreate, async (message) => {
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (!message.content.match(/^!!(add|remove) \d+$/)) return;

    const id = message.content.split(" ").at(-1)!;

    if (message.content.startsWith("!!add")) {
        add(id);
        await message.reply(`added ${id}`).catch();
    } else {
        remove(id);
        await message.reply(`removed ${id}`).catch();
    }

    ids = get();
});

logger.info("Kirara Event Bot is now running.");

const Discord = require('discord.js');
const client = new Discord.Client();

const settings = require("./settings.json");

var guild;

client.on('ready', function() {
	console.log(`Logged in as ${client.user.tag}!`);
	guild = client.guilds.get(settings.discord.guild);
});

var functions = {
	"hello": function(channel, user, member, roles, isMod, msg) {
		msg.reply("Hello! :wave:");
	},

	"role": function(channel, user, member, roles, isMod, msg) {
		let content = msg.content;
		let parts = content.toLowerCase().split(" ").slice(1);

		if(parts.length == 0) {
			msg.reply(`You must specify a role.`);
			return;
		}

		let roleWanted = parts.join(" ");

		let roleList = settings.toggleableRoles.slice(0).map(function(r) {
			return r.toLowerCase();
		});

		if(roleList.indexOf(roleWanted) === -1) {
			msg.reply("This is not a toggleable role.");
			return;
		}

		let mentionableRole;
		let wantedRole;
		let guildRoles = guild.roles.array();

		for(let idx in guildRoles) {
			let r = guildRoles[idx];
			let name = r.name.toLowerCase();

			if(name == "mentionable") {
				mentionableRole = r;
			}
			if(name == roleWanted) {
				wantedRole = r;
			}
		}

		let rolesHas = roles.array();
		let hasWantedRole = false;
		let mentionableRoleCount = 0;

		for(let idx in rolesHas) {
			let h = rolesHas[idx];
			let name = h.name.toLowerCase();

			if(name == roleWanted) {
				hasWantedRole = true;
			}

			if(name.indexOf("mentionable") !== -1 && name.indexOf(" ") !== -1) {
				mentionableRoleCount++;
			}
		}

		if(hasWantedRole) {
			console.log(mentionableRoleCount);
			if(mentionableRoleCount === 1 && wantedRole.name.toLowerCase().indexOf("mentionable") !== -1) {
				member.removeRole(mentionableRole);
			}
			member.removeRole(wantedRole);
			msg.reply(`You no longer have the ${wantedRole.name} role.`);
		} else {
			if(mentionableRoleCount === 0 && wantedRole.name.toLowerCase().indexOf("mentionable") !== -1) {
				member.addRole(mentionableRole);
			}
			member.addRole(wantedRole);
			msg.reply(`You now have the ${wantedRole.name} role.`);
		}
	}
}

client.on('message', function(msg) {
	let channel = msg.channel;
	let user = msg.author;

	if(user.id === client.user.id) {
		return;
	}
	
	if(channel.id !== settings.channels.commands && channel.type !== "dm") {
		return;
	}

	let content = msg.content;
	if(content[0] !== settings.commandPrefix) {
		return;
	}
	content = content.slice(1);

	let member;
	let roles;
	if(channel.type === "dm") {
		member = guild.members.get(user.id);
	} else {
		member = msg.member;
	}
	roles = member.roles;

	let isMod = false;

	for(let idx in settings.moderationRoles) {
		let mr = settings.moderationRoles[idx];

		if(roles.has(mr)) {
			isMod = true;
		}
	}

	let cmd = content.split(" ").slice(0, 1);
	if(cmd in functions) {
		functions[cmd](channel, user, member, roles, isMod, msg);
	}

	//msg.reply(`GUILD ID -- ${guild.id}\nMEMBER ID -- ${member.id}\nUSER ID -- ${user.id}\nCONSIDERED MOD -- ${isMod}`);
});

client.login(settings.discord.token);
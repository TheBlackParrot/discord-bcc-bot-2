const Discord = require('discord.js');
const fs = require("fs");

const settings = require("./settings.json");

var guild;
const client = new Discord.Client();

try {
	var muteData = require("./mutes.json");
} catch {
	var muteData = {};
}

client.on('ready', function() {
	console.log(`Logged in as ${client.user.tag}!`);
	guild = client.guilds.get(settings.discord.guild);
});

var functions = {
	"hello": function(channel, user, member, roles, isMod, msg) {
		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		msg.reply("Hello! :wave:");
	},

	"role": function(channel, user, member, roles, isMod, msg) {
		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

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
	},

	"mute": function(channel, user, member, roles, isMod, msg) {
		if(!isMod) {
			return;
		}

		let parts = msg.content.split(" ").slice(1);
		if(parts.length < 2) {
			msg.reply("You must specify who to mute.");
			return;
		}

		let victim = msg.mentions.members.first();
		if(!victim) {
			victim = msg.guild.members.get(parts[0]);
			if(!victim) {
				victim = msg.guild.members.find("displayName", parts[0]);
				if(!victim) {
					victim = msg.guild.members.find("name", parts[0]);
					if(!victim) {
						msg.reply(`Unable to find mute victim. (${parts[0]})`);
						return;
					}
				}
			}
		}

		if(victim.roles.get(settings.muteRole)) {
			msg.reply(`This member is already muted. (${victim.displayName}#${victim.user.discriminator}`);
			return;
		}

		var minutes = parseInt(parts[1]);
		if(!minutes) {
			msg.reply(`Time must be in minutes. (${parts[1]})`);
			return;
		}

		victim.addRole(settings.muteRole);
		msg.reply(`${victim.displayName}#${victim.user.discriminator} has been muted for ${minutes.toLocaleString()} minutes.`);

		muteData.push({
			"member": victim.id,
			"timestampEnd": minutes == -1 ? -1 : Date.now() + (minutes*60*1000)
		});
		fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

		var out = [];
		if(minutes != -1) {
			out.push(`You have been muted in ${guild.name} by a moderator for ${minutes.toLocaleString()} minutes.`);
		} else {
			out.push(`You have been permanently muted in ${guild.name} by a moderator.`);
		}

		victim.send(out.join("\n"));
	},

	"unmute": function(channel, user, member, roles, isMod, msg) {
		if(!isMod) {
			return;
		}

		let parts = msg.content.split(" ").slice(1);
		if(parts.length < 1) {
			msg.reply("You must specify who to unmute.");
			return;
		}

		let victim = msg.mentions.members.first();
		if(!victim) {
			victim = msg.guild.members.get(parts[0]);
			if(!victim) {
				victim = msg.guild.members.find("displayName", parts[0]);
				if(!victim) {
					victim = msg.guild.members.find("name", parts[0]);
					if(!victim) {
						msg.reply(`Unable to find mute victim. (${parts[0]})`);
						return;
					}
				}
			}
		}

		if(!victim.roles.get(settings.muteRole)) {
			msg.reply(`This member is not muted. (${victim.name}#${victim.user.discriminator}`);
			return;
		}

		victim.removeRole(settings.muteRole);
		msg.reply(`${victim.displayName}#${victim.user.discriminator} has been unmuted.`);

		for(var idx in muteData) {
			var muteRow = muteData[idx];
			if(muteRow.member == victim.id) {
				muteData.splice(idx);
				break;
			}
		}
		fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

		victim.send(`Your mute in ${guild.name} has ended.`);
	}
}

function muteTick() {
	if(!muteData.length) {
		return;
	}

	let now = Date.now();
	let staff = client.channels.get(settings.staffChannel);

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.timestampEnd != -1) {
			if(now >= parseInt(data.timestampEnd)) {
				let victim = guild.members.get(data.member);

				if(victim) {
					if(victim.roles.get(settings.muteRole)) {
						victim.removeRole(settings.muteRole);
						victim.send(`Your mute in ${guild.name} has ended.`);
						staff.send(`Mute for ${victim.displayName}#${victim.user.discriminator} (${data.member}) has ended.`);
					}
				} else {
					staff.send(`Mute for ${data.member} has ended. (not present on guild)`);
				}

				console.log(`ended mute for member ID ${data.member}`);

				muteData.splice(idx, 1);
				fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");
			}
		}
	}
}
var muteTickInterval = setInterval(muteTick, 5000);

client.on('message', function(msg) {
	let channel = msg.channel;
	let user = msg.author;

	if(user.id === client.user.id) {
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

client.on("guildMemberAdd", function(member) {
	let now = Date.now();

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.member == member.id) {
			if(data.timestampEnd == -1 || now < parseInt(data.timestampEnd)) {
				member.addRole(settings.muteRole);
			}
		}
	}	
});

client.login(settings.discord.token);
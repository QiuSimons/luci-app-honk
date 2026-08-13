local honk = require "luci.model.honk_tools"
local m, s, o

m = Map("honk", translate("Global Settings"), translate("Configure global settings for HONK."))

local config_file = "/etc/honk/config.dae"

s = honk.init_editor(m, "global")

s:option(Flag, "enabled", translate("Enabled")).rmempty = false

o = s:option(Flag, "subscribe_auto_update", translate("Enable Auto Subscribe Update"))
o.rmempty = false

o = s:option(ListValue, "subscribe_update_week_time", translate("Update Cycle"))
for i, v in ipairs({ translate("Every Day"), translate("Every Monday"), translate("Every Tuesday"), translate("Every Wednesday"), translate("Every Thursday"), translate("Every Friday"), translate("Every Saturday"), translate("Every Sunday") }) do
    o:value(i == 1 and "*" or tostring(i - 1), v)
end
o.default = "*"
o:depends('subscribe_auto_update', '1')

o = s:option(ListValue, "subscribe_update_day_time", translate("Update Time (Every Day)"))
for t = 0, 23 do o:value(t, t..":00") end
o.default = 0
o:depends('subscribe_auto_update', '1')

honk.add_editor(s, config_file, "globalconf", translate("Global Configuration"), translate("Correctly configure the include field for separate-config to work, or enter complete configuration here."))

return m


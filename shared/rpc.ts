import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { graphsSchema, inboxSchema, prefsSchema, RANGES, ruleInputSchema } from "./model";

export const getInboxRpc = defineRpc({
  name: "inbox.get",
  input: z.object({ range: z.enum(RANGES), force: z.boolean() }),
  output: inboxSchema,
});

/** Graph data is only loaded when the graphs panel is opened. */
export const getGraphsRpc = defineRpc({
  name: "graphs.get",
  input: z.object({ range: z.enum(RANGES) }),
  output: graphsSchema,
});

export const addRuleRpc = defineRpc({
  name: "rules.add",
  input: ruleInputSchema,
  output: z.object({ id: z.string() }),
});

export const deleteRuleRpc = defineRpc({
  name: "rules.delete",
  input: z.object({ id: z.string() }),
  output: z.object({}),
});

export const getPrefsRpc = defineRpc({
  name: "prefs.get",
  input: z.object({}),
  output: prefsSchema,
});

export const setPrefsRpc = defineRpc({
  name: "prefs.set",
  input: prefsSchema,
  output: z.object({}),
});

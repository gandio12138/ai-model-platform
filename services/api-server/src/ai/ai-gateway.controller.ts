import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { PublicAuthGuard, PublicRequestUser } from "../public/public-auth.guard.js";
import { AiGatewayService } from "./ai-gateway.service.js";

@Controller()
export class AiGatewayController {
  constructor(@Inject(AiGatewayService) private readonly ai: AiGatewayService) {}

  @Get("/v1/models")
  async openAiModels(@Headers("authorization") authorization?: string) {
    const context = await this.ai.authenticateApiKey(authorization);
    return this.ai.listOpenAiModels(context);
  }

  @Post("/v1/chat/completions")
  async chatCompletions(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: any
  ) {
    const context = await this.ai.authenticateApiKey(authorization);
    const messages = (body.messages as Array<Record<string, unknown>> | undefined) ?? [];
    const completion = await this.ai.complete({
      context,
      model: String(body.model ?? ""),
      messages: messages.map((message) => ({
        role: String(message.role ?? "user") as "system" | "user" | "assistant",
        content: String(message.content ?? "")
      })),
      source: "developer_api",
      stream: Boolean(body.stream),
      maxTokens: body.max_tokens,
      idempotencyKey: body.idempotency_key ? String(body.idempotency_key) : null
    });

    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      for (const chunk of chunkText(completion.content)) {
        res.write(
          `data: ${JSON.stringify({
            id: completion.requestId,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
          })}\n\n`
        );
      }
      res.write(
        `data: ${JSON.stringify({
          id: completion.requestId,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: completion.usage.input_tokens,
            completion_tokens: completion.usage.output_tokens,
            total_tokens: completion.usage.total_tokens
          }
        })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.json({
      id: completion.requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: completion.usage.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: completion.content },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: completion.usage.input_tokens,
        completion_tokens: completion.usage.output_tokens,
        total_tokens: completion.usage.total_tokens
      }
    });
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/chat/estimate")
  estimate(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.ai.estimateForUser(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/chat/sessions")
  createSession(@Req() req: { user: PublicRequestUser }, @Body() body: Record<string, unknown>) {
    return this.ai.createChatSession(req.user, body);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/chat/sessions")
  sessions(@Req() req: { user: PublicRequestUser }, @Query() query: Record<string, unknown>) {
    return this.ai.listChatSessions(req.user, query);
  }

  @UseGuards(PublicAuthGuard)
  @Get("/api/chat/sessions/:id")
  session(@Req() req: { user: PublicRequestUser }, @Param("id") id: string) {
    return this.ai.getChatSession(req.user, id);
  }

  @UseGuards(PublicAuthGuard)
  @Post("/api/chat/sessions/:id/messages")
  sendMessage(
    @Req() req: { user: PublicRequestUser },
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.ai.sendChatMessage(req.user, id, body);
  }

  @UseGuards(PublicAuthGuard)
  @Delete("/api/chat/sessions/:id")
  deleteSession(@Req() req: { user: PublicRequestUser }, @Param("id") id: string) {
    return this.ai.deleteChatSession(req.user, id);
  }
}

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 24) {
    chunks.push(text.slice(i, i + 24));
  }
  return chunks.length ? chunks : [""];
}

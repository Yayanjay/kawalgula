import { Controller, Post, Get, Patch, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TemplatesService } from "./templates.service";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { PaginationRequest, TemplateVariables } from "@kawalgula/shared";

@Controller("templates")
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Post("list")
  async list(@Body() dto: PaginationRequest) {
    return this.templatesService.list(dto);
  }

  @Get(":key")
  async get(@Param("key") key: string) {
    return this.templatesService.findByKey(key);
  }

  @Patch(":key")
  async update(@Param("key") key: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(key, dto);
  }

  @Post(":key/reset")
  async reset(@Param("key") key: string) {
    return this.templatesService.reset(key);
  }

  @Post("preview")
  async preview(@Body() body: { key: string; variables: TemplateVariables }) {
    return this.templatesService.preview(body.key, body.variables);
  }
}

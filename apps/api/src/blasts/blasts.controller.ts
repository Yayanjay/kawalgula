import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { BlastsService } from "./blasts.service";
import { CreateBlastDto } from "./dto/create-blast.dto";
import { PaginationRequest } from "@kawalgula/shared";
import { Request } from "express";

@Controller("blasts")
@UseGuards(JwtAuthGuard)
export class BlastsController {
  constructor(private blastsService: BlastsService) {}

  @Post("list")
  async list(@Body() dto: PaginationRequest) {
    return this.blastsService.list(dto);
  }

  @Post()
  async create(@Body() dto: CreateBlastDto, @Req() req: Request) {
    const admin = req["admin"] as { id: string };
    return this.blastsService.create(dto, admin.id);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.blastsService.findById(id);
  }

  @Post(":id/send")
  async send(@Param("id") id: string) {
    return this.blastsService.send(id);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.blastsService.delete(id);
  }
}

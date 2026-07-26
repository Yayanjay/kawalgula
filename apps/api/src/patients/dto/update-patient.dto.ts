import { IsString, IsOptional, IsDateString, IsIn } from "class-validator";

export class UpdatePatientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  dob?: string;

  @IsString()
  @IsOptional()
  @IsIn(["active", "completed", "dropped_out"])
  treatmentStatus?: string;
}

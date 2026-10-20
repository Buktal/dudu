package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 用户组名称写入契约。
 */
public record ConsoleGroupSaveDTO(@NotBlank @Size(max = 100) String groupName) implements ConsoleRequest {
    public ConsoleGroupSaveDTO {
        groupName = groupName == null ? null : groupName.trim();
    }
}

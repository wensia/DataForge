"""统一响应模型"""

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ResponseModel(BaseModel, Generic[T]):
    """统一响应模型

    Attributes:
        code: 响应码，200 表示成功
        message: 响应消息
        data: 响应数据
    """

    code: int = 200
    message: str = "success"
    data: Optional[T] = None

    @classmethod
    def success(
        cls, data: T = None, message: str = "success"
    ) -> "ResponseModel[T]":
        """成功响应

        Args:
            data: 响应数据
            message: 响应消息

        Returns:
            ResponseModel: 成功响应对象
        """
        return cls(code=200, message=message, data=data)

    @classmethod
    def error(
        cls, code: int = 400, message: str = "error", data: T = None
    ) -> "ResponseModel[T]":
        """错误响应

        Args:
            code: 错误码
            message: 错误消息
            data: 错误数据

        Returns:
            ResponseModel: 错误响应对象
        """
        return cls(code=code, message=message, data=data)







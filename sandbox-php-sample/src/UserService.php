<?php
declare(strict_types=1);

namespace App\Service;

final class UserService
{
    public function __construct(private readonly AuditLogger $logger)
    {
    }

    public function findUser(int $id): ?User
    {
        if ($id <= 0) {
            $this->logger->warn('Invalid user id', ['id' => $id]);
            return null;
        }

        $user = $this->load($id);
        if ($user === null) {
            $this->logger->info('User not found', ['id' => $id]);
        }

        return $user;
    }

    private function load(int $id): ?User
    {
        return null;
    }
}
